# Meta Platform Configuration

## Account IDs

| Resource             | ID                  | Notes                   |
| -------------------- | ------------------- | ----------------------- |
| Facebook Page        | `133159026536737`   | VividWalls page         |
| Instagram Business   | `17841461891805046` | @vividwalls             |
| Meta Ad Account      | `777751590847461`   | Primary ad account      |
| Meta Business        | `281179304635214`   | vividwalls.space        |
| Meta App (vivid_mas) | `1043439837544028`  | API app for MABOS       |
| MABOS System User    | `61582180864384`    | Admin-level system user |

## API Endpoints

| Operation                    | Method | Endpoint                                          |
| ---------------------------- | ------ | ------------------------------------------------- |
| Facebook text post           | POST   | `/{page_id}/feed`                                 |
| Facebook photo post          | POST   | `/{page_id}/photos`                               |
| Facebook scheduled post      | POST   | `/{page_id}/feed` (with `scheduled_publish_time`) |
| Instagram create container   | POST   | `/{ig_id}/media`                                  |
| Instagram publish            | POST   | `/{ig_id}/media_publish`                          |
| Instagram carousel container | POST   | `/{ig_id}/media` (with `children`)                |
| Check permissions            | GET    | `/me/permissions`                                 |
| Exchange for Page Token      | GET    | `/{page_id}?fields=access_token`                  |
| Ad campaign create           | POST   | `/act_{ad_account_id}/campaigns`                  |
| Ad insights                  | GET    | `/{campaign_id}/insights`                         |

**Base URL:** `https://graph.facebook.com/v21.0/`

## System User Assets (7 assigned)

1. VividWalls Facebook Page — Full access
2. kingler@me.com Ad Account — Full access
3. Campaign King App — Full access
4. vivid_mas App — Full access
5. vividwalls.space's Pixel — Full access
6. vividwalls.space Instagram — Full access
7. vividwalls.space's Pixel Dataset — Full access

## Permissions on vivid_mas App

Both at **Standard** access level (approved):

- `pages_read_engagement`
- `pages_manage_posts`

App status: **Live**, Business verified.
