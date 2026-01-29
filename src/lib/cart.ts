export type CartProduct = {
  id: string;
  title: string;
  unitAmount: number;
  details?: string;
  quantity?: number;
};

const CART_JOBS_KEY = "kdw-cart-jobs";
const CART_PRODUCTS_KEY = "kdw-cart-products";

const readJson = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
};

export const getCartJobs = () => readJson<string[]>(CART_JOBS_KEY, []);

export const setCartJobs = (jobIds: string[]) =>
  writeJson(CART_JOBS_KEY, jobIds);

export const getCartProducts = () =>
  readJson<CartProduct[]>(CART_PRODUCTS_KEY, []);

export const setCartProducts = (products: CartProduct[]) =>
  writeJson(CART_PRODUCTS_KEY, products);
