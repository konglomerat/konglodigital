import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faLocationDot,
  faUser,
  faCar,
  faScrewdriverWrench,
  faShirt,
  faCouch,
  faCube,
  faEllipsis,
} from "@fortawesome/free-solid-svg-icons";

export const RESOURCE_TYPES = {
  place: {
    label: "Place",
    icon: faLocationDot,
    color: "text-blue-500",
  },
  person: {
    label: "Person",
    icon: faUser,
    color: "text-emerald-500",
  },
  vehicle: {
    label: "Vehicle",
    icon: faCar,
    color: "text-amber-500",
  },
  tool: {
    label: "Tool",
    icon: faScrewdriverWrench,
    color: "text-violet-500",
  },
  clothing: {
    label: "Clothing",
    icon: faShirt,
    color: "text-pink-500",
  },
  furniture: {
    label: "Furniture",
    icon: faCouch,
    color: "text-orange-500",
  },
  object: {
    label: "Object",
    icon: faCube,
    color: "text-slate-500",
  },
  other: {
    label: "Other",
    icon: faEllipsis,
    color: "text-zinc-500",
  },
} as const satisfies Record<
  string,
  {
    label: string;
    icon: IconDefinition;
    color: string;
  }
>;

export type ResourceType = keyof typeof RESOURCE_TYPES;
