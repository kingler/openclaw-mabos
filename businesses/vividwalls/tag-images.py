#!/usr/bin/env python3
"""Batch tag Shopify images with type and scene classifications."""

import json, os, re, sys, time, requests

def classify(filename):
    fn = filename.lower()
    
    # === LOGO ===
    if any(x in fn for x in ['logo', '-logo', '_logo']):
        return 'type:logo'
    
    # === BRANDING (non-logo) ===
    if fn.startswith(('icon-',)):
        return 'branding'
    if fn.startswith(('kingler_', 'kinglerbercyportrait')):
        return 'branding'
    if fn.startswith('vividwalls_sm_image_post') or 'sm_image_post' in fn:
        return 'branding'
    
    # === CANVAS FRAMES (frame reference images) ===
    if any(x in fn for x in ['floatingframe', 'floating_frame', 'wood_texture_floating', 'bronze_floating']):
        return 'type:canvas-frame'
    if fn.startswith('fl-'):
        return 'type:canvas-frame'
    
    # === OTHER (non-art) ===
    if 'replicate-prediction' in fn:
        return 'other'
    if re.match(r'^\d+-?(large|small)', fn):
        return 'other'
    if re.match(r'^\d{3}\.png$', fn):
        return 'other'
    
    # === SCENES ===
    
    # Restaurant / Dining
    if any(x in fn for x in ['restaurant', 'dinningroom', 'dining_room']):
        return 'scene:restaurant'
    if 'kingler.design_modern_style_spacious_restaurant' in fn:
        return 'scene:restaurant'
    if 'hospitality_restaurant' in fn:
        return 'scene:restaurant'
    
    # Hotel Room Suite
    if any(x in fn for x in ['hotelroom', 'hotel-room', 'hotel_room']):
        return 'scene:hotel-suite'
    if 'hospitality-hotelroom' in fn:
        return 'scene:hotel-suite'
    
    # Hotel Lobby / Hospitality (general)
    if any(x in fn for x in ['hospitallobby', 'hospital_lobby']):
        return 'scene:hotel-lobby'
    if 'hospitality' in fn and 'hotelroom' not in fn and 'hotel-room' not in fn and 'restaurant' not in fn:
        return 'scene:hotel-lobby'
    
    # Office
    if any(x in fn for x in ['officescene', 'homeoffice', 'home_office', 'business_office']):
        return 'scene:office'
    if re.search(r'fractal(bw)?-officespace', fn):
        return 'scene:office'
    if 'vividwalls.co_home_office' in fn:
        return 'scene:office'
    
    # Living Room
    scene_lr = [
        'homescenelivingroom', 'homesceneliving-room', 'homelivingroom',
        'homescene-livingroom', 'home_scene', 'homescene',
        'home-scene', 'wallsceen', 'sofa-scene', 'sofa_scene',
    ]
    if any(x in fn for x in scene_lr):
        return 'scene:living-room'
    if fn.startswith('scene-'):
        return 'scene:living-room'
    if 'homescene' in fn:
        return 'scene:living-room'
    if fn.startswith('vividwalls.co_') and 'logo' not in fn:
        return 'scene:living-room'
    
    # === GALLERY WRAP (rolled canvas mockups) ===
    if 'rolled-canvas-mockup' in fn or 'rolled_canvas_mockup' in fn:
        return 'type:gallery-wrap'
    
    # === PRODUCT (artwork mockups and framed product shots) ===
    if 'artworkproductmockup' in fn or 'artwork_productimage' in fn or 'productimage' in fn:
        return 'type:product'
    
    has_frame = bool(re.search(r'(black|white|blk|wht|no)[_\s-]?frame', fn))
    has_canvas = bool(re.search(r'canvas[_-]', fn))
    has_dims = bool(re.search(r'\d+x\d+', fn))
    has_print_suffix = bool(re.search(r'-print\.', fn))
    
    if (has_frame or has_canvas) and has_dims:
        return 'type:product'
    if has_print_suffix:
        return 'type:product'
    if 'canvas_' in fn and 'frame' in fn:
        return 'type:product'
    if re.search(r'mosaic.*frame.*\d+x\d+', fn):
        return 'type:product'
    if 'geointersec' in fn and 'frame' in fn:
        return 'type:product'
    
    # === PRINTABLE ===
    if fn.startswith('vw-printable-'):
        return 'type:printable'
    if fn.startswith('gallery-hero'):
        return 'type:printable'
    if fn.startswith('vivid-intersecting-perspectives'):
        return 'type:printable'
    if fn.startswith('vivid-geometric_intersection-no') and not has_frame:
        return 'type:printable'
    
    # Default: printable (raw artwork)
    return 'type:printable'


def build_alt_text(filename, tag):
    base = filename.rsplit('.', 1)[0]
    base = re.sub(r'_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', base)
    desc = base.replace('_', ' ').replace('-', ' ')
    desc = re.sub(r'\s+', ' ', desc).strip().title()
    return f"[{tag}] {desc} — {filename}"


def main():
    dry_run = '--dry-run' in sys.argv
    
    inv_path = os.path.expanduser('~/openclaw-mabos/businesses/vividwalls/image-inventory.json')
    with open(inv_path) as f:
        images = json.load(f)
    
    print(f"Loaded {len(images)} images")
    
    classified = {}
    for img in images:
        fn = img['filename']
        if not fn:
            continue
        tag = classify(fn)
        classified[fn] = {
            'id': img['id'],
            'tag': tag,
            'alt': build_alt_text(fn, tag)
        }
    
    from collections import Counter
    tag_counts = Counter(v['tag'] for v in classified.values())
    print("\n=== Classification Results ===")
    for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1]):
        print(f"  {tag}: {count}")
    print(f"  TOTAL: {sum(tag_counts.values())}")
    
    print("\n=== Samples ===")
    for tag in sorted(tag_counts.keys()):
        samples = [fn for fn, v in classified.items() if v['tag'] == tag][:3]
        print(f"\n  [{tag}]")
        for s in samples:
            print(f"    {s} -> {classified[s]['alt'][:80]}")
    
    if dry_run:
        print("\n--- DRY RUN: No changes made ---")
        report_path = os.path.expanduser('~/openclaw-mabos/businesses/vividwalls/image-tags-report.json')
        with open(report_path, 'w') as f:
            json.dump(classified, f, indent=2)
        print(f"Report saved to {report_path}")
        return
    
    # === APPLY TAGS ===
    shop = os.environ.get("SHOPIFY_STORE", "vividwalls-2.myshopify.com")
    token = os.environ.get("SHOPIFY_ACCESS_TOKEN")
    url = f"https://{shop}/admin/api/2024-01/graphql.json"
    headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
    
    skip_tags = ()
    to_update = {fn: v for fn, v in classified.items() if v['tag'] not in skip_tags}
    
    print(f"\nUpdating {len(to_update)} images (skipping {len(classified) - len(to_update)} branding/other)...")
    
    items = list(to_update.items())
    updated = 0
    errors = 0
    
    for batch_start in range(0, len(items), 10):
        batch = items[batch_start:batch_start + 10]
        
        mutations = []
        variables = {}
        for i, (fn, info) in enumerate(batch):
            mutations.append(f'  f{i}: fileUpdate(files: [{{id: $id{i}, alt: $alt{i}}}]) {{ files {{ id alt }} userErrors {{ message }} }}')
            variables[f'id{i}'] = info['id']
            variables[f'alt{i}'] = info['alt']
        
        var_defs = ', '.join(f'$id{i}: ID!, $alt{i}: String!' for i in range(len(batch)))
        mutation = f"mutation UpdateFiles({var_defs}) {{\n" + "\n".join(mutations) + "\n}"
        
        try:
            r = requests.post(url, json={"query": mutation, "variables": variables}, headers=headers, timeout=30)
            data = r.json()
        except Exception as e:
            print(f"  Batch {batch_start//10 + 1}: Request error: {e}")
            errors += len(batch)
            time.sleep(2)
            continue
        
        if 'errors' in data:
            print(f"  Batch {batch_start//10 + 1}: GraphQL error: {data['errors'][0]['message']}")
            errors += len(batch)
        else:
            batch_ok = 0
            for i in range(len(batch)):
                result = data.get('data', {}).get(f'f{i}', {})
                user_errors = result.get('userErrors', [])
                if user_errors:
                    print(f"  Error on {batch[i][0]}: {user_errors[0]['message']}")
                    errors += 1
                else:
                    batch_ok += 1
            updated += batch_ok
        
        done = batch_start + len(batch)
        if done % 100 == 0 or done == len(items):
            print(f"  Progress: {done}/{len(items)} ({updated} updated, {errors} errors)")
        
        time.sleep(0.5)
    
    print(f"\n=== DONE ===")
    print(f"Updated: {updated}")
    print(f"Errors: {errors}")
    print(f"Skipped: {len(classified) - len(to_update)}")

if __name__ == '__main__':
    main()
