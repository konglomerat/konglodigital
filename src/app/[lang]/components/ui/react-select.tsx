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
  control: (base, state) => ({
    ...base,
    minHeight: 40,
    borderRadius: 12,
    borderColor: state.isFocused ? "var(--ring)" : "var(--border)",
    backgroundColor: "var(--card)",
    boxShadow: state.isFocused
      ? "0 0 0 2px color-mix(in srgb, var(--ring) 28%, transparent)"
      : "none",
    transition: "border-color 150ms ease, box-shadow 150ms ease",
    ":hover": {
      borderColor: state.isFocused ? "var(--ring)" : "var(--input)",
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
  menu: (base) => ({
    ...base,
    border: "1px solid var(--border)",
    borderRadius: 12,
    backgroundColor: "var(--popover)",
    boxShadow:
      "0 18px 44px color-mix(in srgb, var(--foreground) 14%, transparent)",
    overflow: "hidden",
  }),
  menuList: (base) => ({
    ...base,
    paddingTop: 6,
    paddingBottom: 6,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "var(--primary-soft)"
      : state.isFocused
        ? "var(--muted)"
        : "transparent",
    color: "var(--foreground)",
    cursor: "pointer",
    ":active": {
      backgroundColor: "var(--primary-soft)",
    },
  }),
  multiValue: (base) => ({
    ...base,
    borderRadius: 9999,
    backgroundColor: "var(--muted)",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "var(--foreground)",
    fontWeight: 500,
  }),
  multiValueRemove: (base) => ({
    ...base,
    borderRadius: 9999,
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
