import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import stripeSDK from 'stripe';
import {
  ApolloError, UserInputError, AuthenticationError, ForbiddenError
} from 'apollo-server-core';
import { isFuture } from 'date-fns';
import * as models from '../db/models.js';

const saltRounds = 10;
const stripe = stripeSDK(process.env.STRIPE_SECRET_KEY);

const recurringInterval = {
  weekly: 'week',
  monthly: 'month',
  yearly: 'year'
};

export default {
  Query: {
    viewOnePlan: async (_, { planId }, { username, err }) => {
      if (username) {
        let errMsg;
        try {
          const { rows } = await models.viewOnePlan(planId);
          if (rows.length === 0) { // no match
            errMsg = 'No plan matched search';
            throw new Error();
          }
          const result = { ...rows[0], planId };
          result.perCycleCost /= 100;
          return result;
        } catch (asyncError) {
          if (errMsg) {
            throw new ApolloError(errMsg);
            // will need to handle this error in front end
            // where the join page will send this query request
          }
          console.log(asyncError);
          throw new ApolloError('Unable to retrieve plan information');
        }
      } else if (err === 'Incorrect token') {
        throw new AuthenticationError(err);
      } else if (err === 'Unauthorized request') {
        throw new ForbiddenError(err);
      }
    },

    viewAllPlans: async (_, __, { username, err }) => {
      if (username) {
        try {
          const { rows } = await models.viewAllPlans(username);
          rows.forEach((row) => {
            row.perCycleCost /= 100;
          });
          return rows;
        } catch (asyncError) {
          console.log(asyncError);
          throw new ApolloError('Unable to retrieve plans information');
        }
      } else if (err === 'Incorrect token') {
        throw new AuthenticationError(err);
      } else if (err === 'Unauthorized request') {
        throw new ForbiddenError(err);
      }
    },
  },

  Plan: {
    activeMembers: async ({ planId }, _, { username, err }) => {
      if (username) {
        try {
          const { rows } = await models.membersOnOnePlan(planId);
          return rows;
        } catch (asyncError) {
          console.log(asyncError);
          throw new ApolloError('Unable to retrieve plan information');
        }
      } else if (err === 'Incorrect token') {
        throw new AuthenticationError(err);
      } else if (err === 'Unauthorized request') {
        throw new ForbiddenError(err);
      }
    },
  },

  Mutation: {
    createUser: async (_, {
      firstName, lastName, username, password, email
    }) => {
      let errMsg;
      username = username.trim().toLowerCase();
      email = email.trim().toLowerCase();
      try {
        const { rows } = await models.checkUser(username, email);
        // username and email do not exist -> create user
        if (rows.length === 0) {
          const hashedPass = await bcrypt.hash(password, saltRounds);
          const { id: stripeCusId } = await stripe.customers.create({
            name: `${firstName} ${lastName}`,
            email
          });
          await models.createUser(firstName, lastName, username, hashedPass, email, stripeCusId);
          const token = jwt.sign({
            // expires after 2 weeks
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 14),
            data: username
          }, process.env.SECRET_KEY);
          return {
            username,
            email,
            token
          };
        // username or email exist --> return error
        } else if (rows[0].username === username) {
          errMsg = 'This username already exists';
          throw new Error();
        } else {
          errMsg = 'This email already exists';
          throw new Error();
        }
      } catch (asyncError) {
        /*
        Because this entire process depends on many async operations
        (2 database queries + 1 bcrypt here),
        this catch block will catch ALL errors from any of these async operations
        and throw a generic error message.
        According to Apollo docs, this should generate an error with code 'INTERNAL_SERVER_ERROR'.
        */

        // if this is an anticipated bad input error
        if (errMsg) {
          throw new UserInputError(errMsg);
        } else {
        // catch all from the rest of async operations
          console.log(asyncError);
          throw new ApolloError('Unable to create user');
        }
      }
    },

    login: async (_, { username, password }) => {
      let errMsg;
      username = username.trim().toLowerCase();
      try {
        const { rows } = await models.getUserInfo(username);
        // if username does not exist, throw error
        if (rows.length === 0) {
          errMsg = 'This username does not exist';
          throw new Error();
        }
        // if username exists but password doesn't match, return null
        const { password: savedPass} = rows[0];
        const result = await bcrypt.compare(password, savedPass);
        if (!result) {
          return null;
        }

        // if password is correct, return a signed token so user can sign in
        const token = jwt.sign({
          // expires after 2 weeks
          exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 14),
          data: username
        }, process.env.SECRET_KEY);

        const { rows: userInfoRows } = await models.getUserInfo(username);
        const { email } = userInfoRows[0];
        return {
          username,
          email,
          token
        };
      } catch (asyncError) {
        if (errMsg) {
          // if anticipated bad input error
          throw new UserInputError(errMsg);
        } else {
          // catch all from rest of async
          console.log(asyncError);
          throw new ApolloError('Unable to log in');
        }
      }
    },

    createPlan: async (_, {
      planName, cycleFrequency, perCycleCost, startDate
    }, { username, err }) => {
      if (username) {
        try {
          planName = planName.trim();
          cycleFrequency = cycleFrequency.toLowerCase();

          // creates stripe price object, also create stripe product in the same call
          perCycleCost *= 100; // store in cents
          const { id: sProdId } = await stripe.products.create({
            name: planName
          });
          // const { id: sPriceId, product: sProdId } = await stripe.prices.create({
          //   product_data: {
          //     name: planName
          //   },
          //   unit_amount: perCyclePerPersonCost,
          //   currency: 'usd',
          //   recurring: {
          //     interval: recurringInterval[cycleFrequency]
          //   },
          // });

          await models.addPlan(
            username,
            planName,
            cycleFrequency,
            perCycleCost,
            sProdId,
            startDate
          );

          return { productId: sProdId };
        } catch (asyncError) {
          console.log(asyncError);
          throw new ApolloError('Unable to create new plan');
        }
      } else if (err === 'Incorrect token') {
        throw new AuthenticationError(err);
      } else if (err === 'Unauthorized request') {
        throw new ForbiddenError(err);
      }
    },

    pay: async (_, { planId, quantity }, { username, err }) => {
      /*
      1. Query database for total price, price ID of plan, for total number of quantities in the plan to calculate the new per-person cost
      2. Create a new price ID, attach this price ID to the product ID of plan (if product already has a price ID attached, then set old price ID to inactive, and activate this new price ID)
      3. For a new person joining, if the start date is in the future, do nothing? If start date has passed, then follow examples above to pass in trial_end for subscription creation
      */

      if (username) {
        try {
          const { rows } = await models.getUserInfo(username);
          const {
            stripeCusId, email
          } = rows[0];
          const sCusId = stripeCusId;
          // create subscription with stripe
          const { rows: getPriceIdStartDateRows } = await models.getPriceIdAndStartDate(planId);
          const { sPriceId, startDate } = getPriceIdStartDateRows[0];
          const { id: subscriptionId, pending_setup_intent } = await stripe.subscriptions.create({
            customer: sCusId,
            items: [
              { price: sPriceId, quantity }
            ],
            payment_behavior: 'default_incomplete',
            payment_settings: {
              save_default_payment_method: 'on_subscription',
              payment_method_types: ['link', 'card'],
            },
            trial_end: Number(startDate),
            expand: ['pending_setup_intent']
          });

          const { client_secret: clientSecret } = pending_setup_intent;
          // save subscriptionId in database
          /*  Right now is NOT the right time to update this subscription info in our db yet
          because customer hasn't paid and db is updated already. This db query will need to be
          run only after successful payment (webhook).
          */

          await models.addSubscriptionId(planId, quantity, subscriptionId, username);
          return { clientSecret };
        } catch (asyncError) {
          console.log(asyncError);
          throw new ApolloError('Unable to create subscription');
        }

      } else if (err === 'Incorrect token') {
        throw new AuthenticationError(err);
      } else if (err === 'Unauthorized request') {
        throw new ForbiddenError(err);
      }
    },

    editPayment: async (_, __, { username, err }) => {
      if (username) {
        try {
          const { rows } = await models.getUserInfo(username);
          const { stripeCusId: customer } = rows[0];
          /*
          Note that we're skipping programmatically configure the session here
          and did that manually in Stripe dev portal.
          */
          const { url } = await stripe.billingPortal.sessions.create({
            customer,
            return_url: 'http://localhost:5647/dashboard/',
          });
          return { portalSessionURL: url };
        } catch (asyncError) {
          console.log(asyncError);
          throw new ApolloError('Unable to get customer portal link');
        }

      } else if (err === 'Incorrect token') {
        throw new AuthenticationError(err);
      } else if (err === 'Unauthorized request') {
        throw new ForbiddenError(err);
      }
    },

  }
};
