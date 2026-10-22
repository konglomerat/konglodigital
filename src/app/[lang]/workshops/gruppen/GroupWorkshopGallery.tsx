// Bilder eines Workshops: eine große Kachel und zwei kleine daneben, weitere
// Bilder darunter. Ohne Foto steht eine Terrazzo-Fläche mit der Marke und der
// Bildbeschreibung als Platzhalter.
import type { GroupWorkshop, GroupWorkshopImage } from "@/lib/group-workshops";
import WorkshopAreaMark from "../WorkshopAreaMark";

function Tile({
  image,
  workshop,
  className,
}: {
  image: GroupWorkshopImage;
  workshop: GroupWorkshop;
  className?: string;
}) {
  return (
    <figure
      className={`relative m-0 min-w-0 overflow-hidden ${
        image.src ? "bg-muted" : workshop.terrazzo
      }${className ? ` ${className}` : ""}`}
    >
      {image.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          alt={image.alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
          <span className="flex bg-card p-1.5">
            <WorkshopAreaMark area={workshop.area} height={48} />
          </span>
          <figcaption className="knglmrt-label max-w-full bg-card px-2 py-1">
            {image.alt}
          </figcaption>
        </div>
      )}
    </figure>
  );
}

export default function GroupWorkshopGallery({ workshop }: { workshop: GroupWorkshop }) {
  const [main, second, third, ...more] = workshop.images;
  if (!main) return null;
  const side = [second, third].filter((image): image is GroupWorkshopImage => Boolean(image));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Tile
          image={main}
          workshop={workshop}
          className={`aspect-[16/10] ${side.length ? "md:col-span-2" : "md:col-span-3"}`}
        />
        {side.length ? (
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1 md:grid-rows-2">
            {side.map((image) => (
              <Tile
                key={image.alt}
                image={image}
                workshop={workshop}
                className="aspect-[3/2] md:aspect-auto md:min-h-[160px]"
              />
            ))}
          </div>
        ) : null}
      </div>
      {more.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-4">
          {more.map((image) => (
            <Tile key={image.alt} image={image} workshop={workshop} className="aspect-[3/2]" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
