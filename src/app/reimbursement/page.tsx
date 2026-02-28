"use client";

import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
	faFileInvoiceDollar,
	faFolderOpen,
	faPlus,
	faRotate,
	faTrash,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../components/Button";
import {
	FormField,
	FormSection,
	Input,
	Select,
	Textarea,
} from "../components/ui/form";

type PositionValue = {
	konto: string;
	betragEuro: string;
	beschreibung: string;
	kostenstelle: string;
};

type CostCenterOption = {
	value: string;
	label: string;
};

type FormValues = {
	betreff: string;
	belegdatum: string;
	antragstellerName: string;
	antragstellerIban: string;
	positions: PositionValue[];
	notiz: string;
	belegDatei: FileList;
};

const euroAmountPattern = /^\d+(,\d{1,2})?$/;
const ibanPattern = /^[A-Z]{2}[0-9A-Z]{13,32}$/;

const emptyPosition = (): PositionValue => ({
	konto: "",
	betragEuro: "",
	beschreibung: "",
	kostenstelle: "",
});

const bytesToBase64 = (bytes: Uint8Array) => {
	const chunkSize = 0x8000;
	let binary = "";
	for (let index = 0; index < bytes.length; index += chunkSize) {
		const chunk = bytes.subarray(index, index + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
	const response = await fetch(url, init);
	const data = (await response.json()) as { error?: string } & T;
	if (!response.ok) {
		throw new Error(data.error ?? "Request failed");
	}
	return data;
};

export default function ReimbursementPage() {
	const {
		register,
		control,
		handleSubmit,
		reset,
		setValue,
		getValues,
		formState: { errors },
	} = useForm<FormValues>({
		defaultValues: {
			betreff: "",
			belegdatum: "",
			antragstellerName: "",
			antragstellerIban: "",
			positions: [emptyPosition()],
			notiz: "",
			belegDatei: undefined,
		},
	});

	const { fields, append, remove } = useFieldArray({
		control,
		name: "positions",
	});

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
	const [costCentersLoading, setCostCentersLoading] = useState(true);
	const [costCentersError, setCostCentersError] = useState<string | null>(null);
	const [result, setResult] = useState<{
		id?: string | null;
		uploadWarning?: string;
		error?: string;
	} | null>(null);

	useEffect(() => {
		let active = true;

		const loadCostCenters = async () => {
			try {
				setCostCentersLoading(true);
				const response = await fetchJson<{ costCenters: CostCenterOption[] }>(
					"/api/campai/cost-centers",
				);

				if (!active) {
					return;
				}

				const items = response.costCenters ?? [];
				setCostCenters(items);
				setCostCentersError(null);

				if (items.length > 0) {
					const firstValue = items[0].value;
					const currentPositions = getValues("positions") ?? [];
					currentPositions.forEach((position, index) => {
						if (!position.kostenstelle) {
							setValue(`positions.${index}.kostenstelle`, firstValue, {
								shouldDirty: false,
								shouldTouch: false,
								shouldValidate: false,
							});
						}
					});
				}
			} catch (error) {
				if (!active) {
					return;
				}
				setCostCentersError(
					error instanceof Error
						? error.message
						: "Kostenstellen konnten nicht geladen werden.",
				);
			} finally {
				if (active) {
					setCostCentersLoading(false);
				}
			}
		};

		loadCostCenters();

		return () => {
			active = false;
		};
	}, [getValues, setValue]);

	const onSubmit = async (values: FormValues) => {
		setIsSubmitting(true);
		setResult(null);

		try {
			const datei = values.belegDatei?.item(0) ?? null;
			if (!datei) {
				setResult({ error: "Bitte eine Belegdatei hochladen." });
				return;
			}

			const bytes = new Uint8Array(await datei.arrayBuffer());

			const response = await fetch("/api/campai/reimbursement", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					betreff: values.betreff,
					belegdatum: values.belegdatum,

					antragstellerName: values.antragstellerName,
					antragstellerIban: values.antragstellerIban,
					positions: values.positions,
					notiz: values.notiz,
					receiptFileBase64: bytesToBase64(bytes),
					receiptFileName: datei.name,
					receiptFileContentType: datei.type || "application/octet-stream",
				}),
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => ({}))) as {
					error?: string;
				};
				setResult({ error: payload.error ?? "Speichern fehlgeschlagen." });
				return;
			}

			const payload = (await response.json().catch(() => ({}))) as {
				id?: string | null;
				uploadWarning?: string;
			};

			setResult({
				id: payload.id ?? null,
				uploadWarning: payload.uploadWarning,
			});

			reset({
				betreff: "",
				belegdatum: "",

				notiz: "",
				belegDatei: undefined,
			});

			if (costCenters.length > 0) {
				const firstValue = costCenters[0].value;
				setValue("positions.0.kostenstelle", firstValue, {
					shouldDirty: false,
					shouldTouch: false,
					shouldValidate: false,
				});
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	const fillWithTestData = () => {
		const defaultCostCenter = costCenters[0]?.value ?? "";

		reset({
			betreff: "Test Rückerstattung Materialkauf",
			belegdatum: new Date().toISOString().slice(0, 10),
			antragstellerName: "Max Mustermann",
			antragstellerIban: "DE44500105175407324931",
			positions: [
				{
					konto: "100340",
					betragEuro: "12,90",
					beschreibung: "Materialkosten",
					kostenstelle: defaultCostCenter,
				},
				{
					konto: "100340",
					betragEuro: "8,10",
					beschreibung: "Fahrtkosten",
					kostenstelle: defaultCostCenter,
				},
			],
			notiz: "Automatisch befüllte Testdaten",
			belegDatei: undefined,
		});

		setResult(null);
	};

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900">
			<main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10">
				<header className="space-y-3">
					<h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
						<span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-blue-600 shadow-sm">
							<FontAwesomeIcon icon={faRotate} className="h-5 w-5" />
						</span>
						<span>Rückerstattungen einreichen</span>
					</h1>
					<p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
						Nur die wichtigsten Felder ausfüllen. Den Rest setzt das System automatisch.
					</p>
				</header>

				<form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
					<FormSection
						title="Deine Angaben"
						icon={faFileInvoiceDollar}
						description="Einfach ausfüllen und absenden."
					>
						<div className="grid gap-4">
							{costCentersError ? (
								<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
									{costCentersError}
								</div>
							) : null}

							<FormField
								label="Wofür war die Ausgabe?"
								required
								error={errors.betreff?.message}
							>
								<Input
									placeholder="z. B. Material für Werkstatt"
									{...register("betreff", {
										required: "Bitte einen kurzen Betreff eintragen.",
									})}
								/>
							</FormField>

							<FormField
								label="Datum auf dem Beleg"
								required
								error={errors.belegdatum?.message}
							>
								<Input
									type="date"
									{...register("belegdatum", {
										required: "Bitte ein Datum angeben.",
									})}
								/>
							</FormField>

							<div className="space-y-3 rounded-2xl border border-zinc-200 p-4">
								<h3 className="text-sm font-semibold text-zinc-900">
									Positionen
								</h3>
								{fields.map((field, index) => (
									<div
										key={field.id}
										className="space-y-3 rounded-xl border border-zinc-200 p-3"
									>
										<div className="grid gap-3 md:grid-cols-2">
											<FormField
												label="Konto"
												required
												error={errors.positions?.[index]?.konto?.message}
											>
												<Input
													placeholder="z. B. 100340"
													{...register(`positions.${index}.konto` as const, {
														required: "Konto ist erforderlich.",
														pattern: {
															value: /^\d+$/,
															message: "Bitte nur Zahlen eingeben.",
														},
													})}
												/>
											</FormField>

											<FormField
												label="Betrag in Euro"
												required
												error={errors.positions?.[index]?.betragEuro?.message}
											>
												<Input
													inputMode="decimal"
													placeholder="z. B. 12,90"
													{...register(
														`positions.${index}.betragEuro` as const,
														{
															required: "Betrag ist erforderlich.",
															pattern: {
																value: euroAmountPattern,
																message:
																	"Bitte Betrag in Euro mit Komma eingeben.",
															},
														},
													)}
												/>
											</FormField>

											<FormField
												label="Beschreibung"
												error={errors.positions?.[index]?.beschreibung?.message}
											>
												<Input
													placeholder="z. B. Material"
													{...register(`positions.${index}.beschreibung` as const)}
												/>
											</FormField>

											<FormField
												label="Kostenstelle (Position)"
												error={errors.positions?.[index]?.kostenstelle?.message}
											>
												<Select
													disabled={costCentersLoading || costCenters.length === 0}
													{...register(`positions.${index}.kostenstelle` as const, {
														required: "Bitte eine Kostenstelle auswählen.",
													})}
												>
													<option value="">
														{costCentersLoading
															? "Kostenstellen werden geladen..."
															: "Kostenstelle auswählen"}
													</option>
													{costCenters.map((costCenter) => (
														<option key={costCenter.value} value={costCenter.value}>
															{costCenter.label}
														</option>
													))}
												</Select>
											</FormField>
										</div>

										<Button
											type="button"
											kind="danger-secondary"
											icon={faTrash}
											disabled={fields.length <= 1}
											onClick={() => remove(index)}
										>
											Position entfernen
										</Button>
									</div>
								))}

								<Button
									type="button"
									icon={faPlus}
									onClick={() =>
										append({
											...emptyPosition(),
											kostenstelle: costCenters[0]?.value ?? "",
										})
									}
								>
									Position hinzufügen
								</Button>
							</div>

							<FormField
								label="Zusätzliche Info (optional)"
								error={errors.notiz?.message}
							>
								<Textarea
									placeholder="Optional: kurze Notiz"
									{...register("notiz")}
								/>
							</FormField>

							<FormField
								label="Belegdatei"
								required
								hint="1 Datei, max. 10 MB"
								error={errors.belegDatei?.message as string | undefined}
							>
								<Input
									type="file"
									accept=".pdf,.doc,.docx,.odt,.ods,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
									{...register("belegDatei", {
										validate: {
											required: (files) =>
												!!files?.length || "Bitte eine Belegdatei hochladen.",
											maxOneFile: (files) =>
												!files ||
												files.length <= 1 ||
												"Es ist nur eine Datei erlaubt.",
											maxSize: (files) => {
												if (!files || files.length === 0) {
													return true;
												}
												const file = files.item(0);
												if (!file) {
													return true;
												}
												return (
													file.size <= 10 * 1024 * 1024 ||
													"Datei darf maximal 10 MB groß sein."
												);
											},
										},
									})}
								/>
							</FormField>

							<div className="space-y-3 rounded-2xl border border-zinc-200 p-4">
								<h3 className="text-sm font-semibold text-zinc-900">Zahlungsdaten</h3>

								<FormField
									label="Kontoinhaber"
									required
									error={errors.antragstellerName?.message}
								>
									<Input
										placeholder="Vor- und Nachname"
										{...register("antragstellerName", {
											required: "Bitte den Namen eintragen.",
										})}
									/>
								</FormField>

								<FormField
									label="IBAN"
									required
									error={errors.antragstellerIban?.message}
								>
									<Input
										placeholder="DE..."
										{...register("antragstellerIban", {
											required: "Bitte die IBAN eintragen.",
											setValueAs: (value) =>
												typeof value === "string"
													? value.replace(/\s+/g, "").toUpperCase()
													: value,
											pattern: {
												value: ibanPattern,
												message: "Bitte eine gültige IBAN eingeben.",
											},
										})}
									/>
								</FormField>
							</div>
						</div>
					</FormSection>

					{result?.error ? (
						<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
							{result.error}
						</div>
					) : null}

					{result?.id ? (
						<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
							Rückerstattung gespeichert. Campai-ID: {result.id}
						</div>
					) : null}

					{result?.uploadWarning ? (
						<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
							{result.uploadWarning}
						</div>
					) : null}

					<section className="flex flex-wrap gap-3">
						<Button
							type="button"
							kind="secondary"
							icon={faRotate}
							onClick={fillWithTestData}
							disabled={isSubmitting}
						>
							Mit Testdaten füllen
						</Button>

						<Button
							type="submit"
							kind="primary"
							icon={faFolderOpen}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Wird gesendet…" : "Rückerstattung absenden"}
						</Button>
					</section>
				</form>
			</main>
		</div>
	);
}
