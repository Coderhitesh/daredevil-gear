import { Backpack, Tent, Flashlight, Axe, Glasses, Footprints, Shirt, Crosshair, ShieldCheck, Sparkles, Fuel, Compass } from 'lucide-react';

/** Icon + soft tint per department slug (falls back to a compass). */
const MAP = {
  'bags-backpacks': { Icon: Backpack, tint: '#EAF1FA', ink: '#2F5D8A' },
  'camping-outdoor': { Icon: Tent, tint: '#E8F4EC', ink: '#2F6B3B' },
  'torches-lighting': { Icon: Flashlight, tint: '#FDEFE5', ink: '#C24A12' },
  'tools-survival': { Icon: Axe, tint: '#F1EEFA', ink: '#5B4C9A' },
  'tactical-eyewear': { Icon: Glasses, tint: '#E7F4F4', ink: '#246B6B' },
  footwear: { Icon: Footprints, tint: '#F7F0E4', ink: '#7A5418' },
  'headwear-apparel': { Icon: Shirt, tint: '#FBECEF', ink: '#9A3550' },
  'training-tactical-gear': { Icon: Crosshair, tint: '#FDEFE5', ink: '#C24A12' },
  'personal-safety': { Icon: ShieldCheck, tint: '#EAF1FA', ink: '#2F5D8A' },
  'memsahab-corner': { Icon: Sparkles, tint: '#FBECEF', ink: '#9A3550' },
  'vehicle-generator-care': { Icon: Fuel, tint: '#E8F4EC', ink: '#2F6B3B' },
};

export function categoryIcon(slug) {
  return MAP[slug] || { Icon: Compass, tint: '#F1EFEA', ink: '#424644' };
}
