#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    fromHosts: [],
    toHost: "",
  };

  for (const arg of args) {
    if (arg.startsWith("--from=")) {
      const value = arg.slice("--from=".length).trim();
      options.fromHosts = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      continue;
    }

    if (arg.startsWith("--to=")) {
      options.toHost = arg.slice("--to=".length).trim();
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.fromHosts.length === 0) {
    throw new Error("Missing --from=<host1,host2,...>");
  }
  if (!options.toHost) {
    throw new Error("Missing --to=<host>");
  }

  return options;
};

const replaceHost = (value, fromHosts, toHost) => {
  if (typeof value !== "string") {
    return value;
  }

  let next = value;
  for (const fromHost of fromHosts) {
    if (next.includes(fromHost)) {
      next = next.split(fromHost).join(toHost);
    }
  }

  return next;
};

const main = async () => {
  const options = parseArgs();
  const supabase = createClient(
    requiredEnv("TARGET_SUPABASE_URL"),
    requiredEnv("TARGET_SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const pageSize = 500;
  let from = 0;
  let scanned = 0;
  let updatedRows = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("resources")
      .select("id,image,images")
      .range(from, to);

    if (error) {
      throw new Error(`Read failed at ${from}-${to}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    scanned += data.length;

    for (const row of data) {
      const nextImage = row.image
        ? replaceHost(row.image, options.fromHosts, options.toHost)
        : row.image;
      const nextImages = Array.isArray(row.images)
        ? row.images.map((item) =>
            replaceHost(item, options.fromHosts, options.toHost),
          )
        : row.images;

      const imageChanged = row.image !== nextImage;
      const imagesChanged = Array.isArray(row.images)
        ? row.images.some((value, index) => value !== nextImages[index])
        : false;

      if (!imageChanged && !imagesChanged) {
        continue;
      }

      const payload = {};
      if (imageChanged) {
        payload.image = nextImage;
      }
      if (imagesChanged) {
        payload.images = nextImages;
      }

      const { error: updateError } = await supabase
        .from("resources")
        .update(payload)
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Update failed for ${row.id}: ${updateError.message}`);
      }

      updatedRows += 1;
    }

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  let remainingImageRows = 0;
  let remainingImagesRows = 0;
  from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("resources")
      .select("id,image,images")
      .range(from, to);

    if (error) {
      throw new Error(`Verify read failed at ${from}-${to}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      if (
        typeof row.image === "string" &&
        options.fromHosts.some((host) => row.image.includes(host))
      ) {
        remainingImageRows += 1;
      }

      if (
        Array.isArray(row.images) &&
        row.images.some(
          (value) =>
            typeof value === "string" &&
            options.fromHosts.some((host) => value.includes(host)),
        )
      ) {
        remainingImagesRows += 1;
      }
    }

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        updatedRows,
        remainingImageRows,
        remainingImagesRows,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
