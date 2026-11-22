import * as migration_20261121_012000_gallery_media_layout from './20261121_012000_gallery_media_layout';
import * as migration_20261122_001000_shared_cms_content from './20261122_001000_shared_cms_content';
import * as migration_20260904_001206_add_konglo_content_blocks from './20260904_001206_add_konglo_content_blocks';
import * as migration_20261003_120000_supabase_sso from './20261003_120000_supabase_sso';
import * as migration_20261003_130000_production_payload_update from './20261003_130000_production_payload_update';
import * as migration_20261003_140000_werkbereich_pages from './20261003_140000_werkbereich_pages';
import * as migration_20261003_150000_openinary_media from './20261003_150000_openinary_media';

export const migrations = [
  {
    up: migration_20260904_001206_add_konglo_content_blocks.up,
    down: migration_20260904_001206_add_konglo_content_blocks.down,
    name: '20260904_001206_add_konglo_content_blocks',
  },
  {
    up: migration_20261003_120000_supabase_sso.up,
    down: migration_20261003_120000_supabase_sso.down,
    name: '20261003_120000_supabase_sso',
  },
  {
    up: migration_20261003_130000_production_payload_update.up,
    down: migration_20261003_130000_production_payload_update.down,
    name: '20261003_130000_production_payload_update',
  },
  {
    up: migration_20261003_140000_werkbereich_pages.up,
    down: migration_20261003_140000_werkbereich_pages.down,
    name: '20261003_140000_werkbereich_pages',
  },
  {
    up: migration_20261003_150000_openinary_media.up,
    down: migration_20261003_150000_openinary_media.down,
    name: '20261003_150000_openinary_media',
  },
  { up: migration_20261121_012000_gallery_media_layout.up, down: migration_20261121_012000_gallery_media_layout.down, name: '20261121_012000_gallery_media_layout' },
  { up: migration_20261122_001000_shared_cms_content.up, down: migration_20261122_001000_shared_cms_content.down, name: '20261122_001000_shared_cms_content' },
];
