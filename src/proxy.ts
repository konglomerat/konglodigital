import { middleware } from "../middleware";

export const proxy = middleware;

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
