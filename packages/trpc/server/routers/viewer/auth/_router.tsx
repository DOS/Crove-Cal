import { ZVerifyCodeInputSchema } from "@calcom/prisma/zod-utils";

import authedProcedure from "../../../procedures/authedProcedure";
import publicProcedure from "../../../procedures/publicProcedure";
import { enforceAuthRateLimit } from "../../../middlewares/authRateLimitMiddleware";
import { router } from "../../../trpc";
import { ZChangePasswordInputSchema } from "./changePassword.schema";
import { ZResendVerifyEmailSchema } from "./resendVerifyEmail.schema";
import { ZSendVerifyEmailCodeSchema } from "./sendVerifyEmailCode.schema";
import { ZVerifyPasswordInputSchema } from "./verifyPassword.schema";

type AuthRouterHandlerCache = {
  changePassword?: typeof import("./changePassword.handler").changePasswordHandler;
  verifyPassword?: typeof import("./verifyPassword.handler").verifyPasswordHandler;
  verifyCodeUnAuthenticated?: typeof import("./verifyCodeUnAuthenticated.handler").verifyCodeUnAuthenticatedHandler;
  resendVerifyEmail?: typeof import("./resendVerifyEmail.handler").resendVerifyEmail;
  sendVerifyEmailCode?: typeof import("./sendVerifyEmailCode.handler").sendVerifyEmailCodeHandler;
  resendVerifySecondaryEmail?: typeof import("./resendVerifyEmail.handler").resendVerifyEmail;
  createAccountPassword?: typeof import("./createAccountPassword.handler").createAccountPasswordHandler;
};

export const authRouter = router({
  changePassword: authedProcedure
    .use(async ({ ctx, input, next }) => {
      await enforceAuthRateLimit("changePassword", ctx, input);
      return next();
    })
    .input(ZChangePasswordInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { changePasswordHandler } = await import("./changePassword.handler");

      return changePasswordHandler({
        ctx,
        input,
      });
    }),

  verifyPassword: authedProcedure
    .use(async ({ ctx, input, next }) => {
      await enforceAuthRateLimit("verifyPassword", ctx, input);
      return next();
    })
    .input(ZVerifyPasswordInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { verifyPasswordHandler } = await import("./verifyPassword.handler");

      return verifyPasswordHandler({
        ctx,
        input,
      });
    }),

  verifyCodeUnAuthenticated: publicProcedure
    .use(async ({ ctx, input, next }) => {
      await enforceAuthRateLimit("verifyCodeUnAuthenticated", ctx, input);
      return next();
    })
    .input(ZVerifyCodeInputSchema)
    .mutation(async ({ input }) => {
      const { verifyCodeUnAuthenticatedHandler } = await import("./verifyCodeUnAuthenticated.handler");

      return verifyCodeUnAuthenticatedHandler({
        input,
      });
    }),

  sendVerifyEmailCode: publicProcedure
    .use(async ({ ctx, input, next }) => {
      await enforceAuthRateLimit("sendVerifyEmailCode", ctx, input);
      return next();
    })
    .input(ZSendVerifyEmailCodeSchema)
    .mutation(async ({ input, ctx }) => {
      const { sendVerifyEmailCodeHandler } = await import("./sendVerifyEmailCode.handler");

      return sendVerifyEmailCodeHandler({
        input,
        req: ctx.req,
      });
    }),

  resendVerifyEmail: authedProcedure
    .use(async ({ ctx, input, next }) => {
      await enforceAuthRateLimit("resendVerifyEmail", ctx, input);
      return next();
    })
    .input(ZResendVerifyEmailSchema)
    .mutation(async ({ input, ctx }) => {
      const { resendVerifyEmail } = await import("./resendVerifyEmail.handler");

      return resendVerifyEmail({
        input,
        ctx,
      });
    }),

  createAccountPassword: authedProcedure
    .use(async ({ ctx, input, next }) => {
      await enforceAuthRateLimit("createAccountPassword", ctx, input);
      return next();
    })
    .mutation(async ({ ctx }) => {
      const { createAccountPasswordHandler } = await import("./createAccountPassword.handler");

      return createAccountPasswordHandler({
        ctx,
      });
    }),
});
