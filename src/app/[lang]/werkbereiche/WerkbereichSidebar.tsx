import type { PayloadBlock } from "@/lib/payload-cms";
import PayloadBlocks from "./PayloadBlocks";
import styles from "./WerkbereichSidebar.module.css";

export default function WerkbereichSidebar({ blocks, werkbereich }: {
  blocks?: PayloadBlock[] | null;
  werkbereich: string;
}) {
  const sidebarBlocks = blocks?.length ? blocks : [
    { blockType: "appSlot", blockName: "Termine", slot: "calendarUpcoming" } satisfies PayloadBlock,
  ];

  return (
    <aside aria-label="Informationen zum Werkbereich" className={styles.sidebar}>
      <PayloadBlocks blocks={sidebarBlocks} werkbereich={werkbereich} area="sidebarLayout" />
    </aside>
  );
}
