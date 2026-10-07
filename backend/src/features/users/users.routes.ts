import { Router } from "express";
import * as userCtrl from "./users.controller";
import { requireAuth } from "../../auth.middleware";

export const usersRouter = Router();

usersRouter.post("/register", userCtrl.register);
usersRouter.post("/login", userCtrl.login);
usersRouter.get("/me", requireAuth, userCtrl.me);
usersRouter.patch("/me", requireAuth, userCtrl.updateMe);
usersRouter.post("/claim", requireAuth, userCtrl.claim);

export default usersRouter;
