import type { NextRequest } from "next/server";

import { handleCashReceipt } from "@/lib/campai-receipts/cash-receipt";

export const POST = (request: NextRequest) =>
  handleCashReceipt(request, "expense");
