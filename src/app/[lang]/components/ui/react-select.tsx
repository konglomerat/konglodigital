"use client";

import Select, {
  type GroupBase,
  type Props,
  type StylesConfig,
} from "react-select";

const createSharedStyles = <
  Option,
  IsMulti extends boolean,
  Group extends GroupBase<Option>,
>(): StylesConfig<Option, IsMulti, Group> => ({
  // Die Kontur des Systems: 2px, kein Radius, kein Ring. Fokus färbt die
  // Kante pink — wie bei jedem anderen Feld auch.
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: 0,
    borderWidth: "var(--hairline-width)",
    borderColor: state.isFocused ? "var(--primary)" : "var(--hairline-color)",
    backgroundColor: "var(--card)",
    boxShadow: "none",
    transition: "border-color 150ms ease",
    ":hover": {
      borderColor: state.isFocused ? "var(--primary)" : "var(--hairline-color)",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "2px 10px",
  }),
  input: (base) => ({
    ...base,
    color: "var(--foreground)",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--foreground)",
  }),
  // Die offene Liste hängt am Feld und trägt die pinke Kontur.
  menu: (base) => ({
    ...base,
    marginTop: "calc(var(--hairline-width) * -1)",
    border: "var(--hairline-width) solid var(--primary)",
    borderRadius: 0,
    backgroundColor: "var(--popover)",
    boxShadow: "none",
    overflow: "hidden",
  }),
  menuList: (base) => ({
    ...base,
    paddingTop: 0,
    paddingBottom: 0,
  }),
  option: (base, state) => ({
    ...base,
    borderTop: "1px solid var(--border)",
    backgroundColor: state.isSelected
      ? "var(--primary-soft)"
      : state.isFocused
        ? "var(--ui-tint-zebra)"
        : "transparent",
    color: "var(--foreground)",
    cursor: "pointer",
    ":active": {
      backgroundColor: "var(--primary-soft)",
    },
  }),
  // Marken sind im System eckig — auch die im Mehrfachfeld.
  multiValue: (base) => ({
    ...base,
    borderRadius: 0,
    backgroundColor: "var(--muted)",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "var(--foreground)",
    fontWeight: 500,
  }),
  multiValueRemove: (base) => ({
    ...base,
    borderRadius: 0,
    color: "var(--muted-foreground)",
    ":hover": {
      backgroundColor: "var(--destructive-soft)",
      color: "var(--destructive)",
    },
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: "var(--border)",
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? "var(--foreground)" : "var(--muted-foreground)",
    ":hover": {
      color: "var(--foreground)",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
    ":hover": {
      color: "var(--foreground)",
    },
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
  }),
  loadingMessage: (base) => ({
    ...base,
    color: "var(--muted-foreground)",
  }),
});

export default function ReactSelect<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>({
  classNamePrefix = "app-react-select",
  styles,
  ...props
}: Props<Option, IsMulti, Group>) {
  return (
    <Select<Option, IsMulti, Group>
      {...props}
      classNamePrefix={classNamePrefix}
      styles={{
        ...createSharedStyles<Option, IsMulti, Group>(),
        ...styles,
      }}
    />
  );
}
