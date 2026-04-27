import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faLocationDot,
  faUser,
  faCar,
  faDiagramProject,
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
    color: "text-primary",
  },
  person: {
    label: "Person",
    icon: faUser,
    color: "text-success",
  },
  vehicle: {
    label: "Vehicle",
    icon: faCar,
    color: "text-warning",
  },
  tool: {
    label: "Tool",
    icon: faScrewdriverWrench,
    color: "text-chart-1",
  },
  project: {
    label: "Project",
    icon: faDiagramProject,
    color: "text-info",
  },
  clothing: {
    label: "Clothing",
    icon: faShirt,
    color: "text-chart-4",
  },
  furniture: {
    label: "Furniture",
    icon: faCouch,
    color: "text-chart-5",
  },
  object: {
    label: "Object",
    icon: faCube,
    color: "text-muted-foreground",
  },
  other: {
    label: "Other",
    icon: faEllipsis,
    color: "text-muted-foreground",
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
