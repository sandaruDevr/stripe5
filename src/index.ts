import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import Stripe from 'stripe';

// Initialize environment variables
config();

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
  databaseURL: 'https://summarygg-a222d-default-rtdb.firebaseio.com',
});

// Initialize Firebase services
export const db = getDatabase(app);
export const auth = getAuth(app);

// Verify Realtime Database connection
const dbRef = db.ref('server_status');
dbRef.set({
  lastStartup: new Date().toISOString(),
  status: 'online'
})
.then(() => console.log('✅ Successfully connected to Realtime Database'))
.catch(error => console.error('❌ Error connecting to Realtime Database:', error));

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// Initialize Express app
const server = express();

// Middleware
server.use(cors());


// Health check endpoint
server.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Stripe webhook endpoint
server.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig || '',
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const usersRef = db.ref('users');
        const snapshot = await usersRef
          .orderByChild('stripeCustomerId')
          .equalTo(customerId)
          .once('value');

        if (!snapshot.exists()) {
          throw new Error('No user found for customer');
        }

        const users = snapshot.val();
        const userId = Object.keys(users)[0];
        const userRef = usersRef.child(userId);

        const currentUserData = (await userRef.once('value')).val();

        await userRef.update({
          uid: currentUserData.uid,
          displayName: currentUserData.displayName,
          email: currentUserData.email,
          createdAt: currentUserData.createdAt,
          lastLoginAt: currentUserData.lastLoginAt,
          summaryCount: currentUserData.summaryCount,
          dailySummaryCount: currentUserData.dailySummaryCount,
          dailySummaryResetTime: currentUserData.dailySummaryResetTime,
          plan: subscription.status === 'active' || subscription.status === 'trialing' ? 'pro' : 'free',
          stripeCustomerId: customerId,
          subscription: {
            subscriptionId: subscription.id,
            priceId: subscription.items.data[0].price.id,
            status: subscription.status,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            trialEnd: subscription.trial_end,
          },
        });

        console.log(`✅ Updated subscription for user ${userId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const usersRef = db.ref('users');
        const snapshot = await usersRef
          .orderByChild('stripeCustomerId')
          .equalTo(customerId)
          .once('value');

        if (snapshot.exists()) {
          const users = snapshot.val();
          const userId = Object.keys(users)[0];
          const userRef = usersRef.child(userId);

          const currentUserData = (await userRef.once('value')).val();

          await userRef.update({
            uid: currentUserData.uid,
            displayName: currentUserData.displayName,
            email: currentUserData.email,
            createdAt: currentUserData.createdAt,
            lastLoginAt: currentUserData.lastLoginAt,
            summaryCount: currentUserData.summaryCount,
            dailySummaryCount: currentUserData.dailySummaryCount,
            dailySummaryResetTime: currentUserData.dailySummaryResetTime,
            plan: 'free',
            subscription: null,
          });

          console.log(`✅ Removed subscription for user ${userId}`);
        }
        break;
      }

case 'invoice.paid': {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  // Find user by Stripe customer ID
  const usersRef = db.ref('users');
  const snapshot = await usersRef
    .orderByChild('stripeCustomerId')
    .equalTo(customerId)
    .once('value');

  if (!snapshot.exists()) {
    console.warn('⚠️ No user found for Stripe customer ID:', customerId);
    break;
  }

  const users = snapshot.val();
  const userId = Object.keys(users)[0];
  const userRef = usersRef.child(userId);

 const userInvoicesRef = userRef.child('invoices');
const invoiceData = {
  status: invoice.status,
  currency: invoice.currency,
  amountPaid: invoice.amount_paid,
  hostedInvoiceUrl: invoice.hosted_invoice_url,
  invoicePdf: invoice.invoice_pdf,
  created: invoice.created,
};

await userInvoicesRef.child(invoice.id).set(invoiceData);

 try {
    // Save invoice under the user's invoices
    await userRef.child('invoices').child(invoice.id).set(invoiceData);
    console.log(`✅ Stored invoice ${invoice.id} under user ${userId}`);
  } catch (error) {
    console.error('❌ Error saving invoice data:', error);
  }

  break;
}

        
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;

        if (invoice.billing_reason === 'subscription_create') {
          const customerId = invoice.customer as string;

          const usersRef = db.ref('users');
          const snapshot = await usersRef
            .orderByChild('stripeCustomerId')
            .equalTo(customerId)
            .once('value');

          if (snapshot.exists()) {
            const users = snapshot.val();
            const userId = Object.keys(users)[0];
            const userRef = usersRef.child(userId);
            const currentUserData = (await userRef.once('value')).val();

            await userRef.update({
              ...currentUserData,
              plan: 'free',
              subscription: null,
            });

            console.log(`⚠️ Trial payment failed. Downgraded user ${userId} to free plan.`);
          }
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('Webhook error:', err);
      return res.status(400).json({
        error: {
          message: err.message || 'Webhook signature verification failed',
          code: 'WEBHOOK_SIGNATURE_ERROR',
          stack: err.stack || '',
        },
      });
    } else {
      console.error('Unknown error:', err);
      return res.status(400).json({
        error: {
          message: 'Unknown error occurred',
          code: 'WEBHOOK_SIGNATURE_ERROR',
        },
      });
    }
  }
});

// After Stripe webhook route — this is safe for all other routes
server.use(express.json());

// Stripe checkout endpoint
server.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const { userId, returnUrl } = req.body;

    // Get user data from Realtime Database
    const userRef = db.ref(`users/${userId}`);
    const snapshot = await userRef.once('value');
    
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = snapshot.val();
    let customerId = userData?.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId },
        email: userData.email,
        name: userData.displayName,
      });
      customerId = customer.id;
      
      // Update user with Stripe customer ID
      await userRef.update({
        stripeCustomerId: customerId,
      });

      console.log(`✅ Created Stripe customer for user ${userId}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRO_PLAN_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 1,
      },
      success_url: `https://silly-cat-6ba5b6.netlify.app`,
      cancel_url: `${returnUrl}?canceled=true`,
    });

    console.log(`✅ Created checkout session for user ${userId}`);
    return res.json({ 
      sessionId: session.id, 
      url: session.url 
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: error });
  }
});

// Stripe portal endpoint
server.post('/api/stripe/create-portal-session', async (req, res) => {
  try {
    const { customerId, returnUrl } = req.body;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log(`✅ Created portal session for customer ${customerId}`);
    return res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Start server
const PORT = parseInt(process.env.PORT || '3000', 10);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
