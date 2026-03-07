export const CAMPAI_PAYMENT_METHOD_TYPES = [
	"sepaCreditTransfer",
	"sepaDirectDebit",
	"cash",
	"online",
] as const;

export type CampaiPaymentMethodType =
	(typeof CAMPAI_PAYMENT_METHOD_TYPES)[number];

export const CAMPAI_PAYMENT_METHOD_LABELS: Record<
	CampaiPaymentMethodType,
	string
> = {
	sepaCreditTransfer: "Überweisung",
	sepaDirectDebit: "Lastschrift",
	cash: "Bar",
	online: "Online",
};

export const isCampaiPaymentMethodType = (
	value: unknown,
): value is CampaiPaymentMethodType =>
	typeof value === "string" &&
	CAMPAI_PAYMENT_METHOD_TYPES.includes(value as CampaiPaymentMethodType);

export const formatCampaiPaymentMethodLabel = (value: string) => {
	if (isCampaiPaymentMethodType(value)) {
		return CAMPAI_PAYMENT_METHOD_LABELS[value];
	}

	return value
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[-_]/g, " ")
		.replace(/^./, (char) => char.toUpperCase());
};