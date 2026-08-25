import express from "express";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { authRouter } from "./modules/auth/auth.routes.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.use("/api/auth", authRouter);

app.use(errorHandler);

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
