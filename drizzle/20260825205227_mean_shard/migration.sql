CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`order_id` int NOT NULL,
	`pizza_type_id` int NOT NULL,
	`quantity` int NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`created_at` timestamp NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `pizza_types` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(256) NOT NULL,
	`price` decimal(10,2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`);--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_pizza_type_id_pizza_types_id_fkey` FOREIGN KEY (`pizza_type_id`) REFERENCES `pizza_types`(`id`);