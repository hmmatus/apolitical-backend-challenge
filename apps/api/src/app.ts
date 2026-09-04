import express from "express";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { orderRouter } from "./modules/order/order.routes.js";
import { pizzaTypeRouter } from "./modules/pizza-type/pizza-type.routes.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.use("/api/auth", authRouter);
app.use("/api/orders", orderRouter);
app.use("/api/pizza-types", pizzaTypeRouter);

app.get("/api-docs.json", (_req, res) => {
  res.json(swaggerSpec);
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
