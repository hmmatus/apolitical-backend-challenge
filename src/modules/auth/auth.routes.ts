import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware.js";
import * as authController from "./auth.controller.js";
import { loginSchema, refreshSchema, signupSchema } from "./auth.dto.js";

export const authRouter = Router();

authRouter.post("/signup", validate(signupSchema), authController.signup);
authRouter.post("/login", validate(loginSchema), authController.login);
authRouter.post("/refresh", validate(refreshSchema), authController.refresh);
authRouter.post("/logout", validate(refreshSchema), authController.logout);
