import type { NextFunction, Request, Response } from "express";
import { authRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";

const authService = new AuthService(authRepository);

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const tokens = await authService.signup(req.body);
    res.status(201).json(tokens);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const tokens = await authService.login(req.body);
    res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
