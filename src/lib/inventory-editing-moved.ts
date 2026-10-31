import { INVENTORY_HOME } from "./openinventory-contract";
export const inventoryEditingMoved = () => Response.json({
  error: "Inventar bitte in OpenInventory bearbeiten.", url: INVENTORY_HOME,
}, { status: 409 });
