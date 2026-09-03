import { z } from "zod";
import { eventTypeAppCardZod } from "../eventTypeAppCardZod";

export const appKeysSchema = z.object({
  api_key: z.string().optional(),
  api_url: z.string().optional(),
});

export const appDataSchema = eventTypeAppCardZod;
