import Stripe from "stripe";
import { config } from "../config.js";

export const stripe: Stripe = new Stripe(config.STRIPE_SECRET_KEY);