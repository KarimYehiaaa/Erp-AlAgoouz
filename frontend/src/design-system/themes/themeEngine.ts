/**
 * ==========================================================================
 * AL-AGOOZ ERP 2.0 — Universal Theme & Multi-Tenant Branding Engine
 * Provides reactive runtime configuration for enterprise branding and themes
 * ==========================================================================
 */

import { reactive, watch } from 'vue';

export interface EnterpriseBranding {
  companyName: string;
  tagline: string;
  companyLogo: string;
  favicon?: string;
  primaryColor?: string;
  secondaryColor?: string;
  borderRadius?: 'sm' | 'md' | 'lg';
  density?: 'compact' | 'cozy';
}

const BRANDING_STORAGE_KEY = 'erp_enterprise_branding';

export const defaultBranding: EnterpriseBranding = {
  companyName: 'بن العجوز',
  tagline: 'منظومة الإدارة والتشغيل المؤسسية',
  companyLogo: '/logo.png',
  primaryColor: '#5A3825',
  secondaryColor: '#B58A4A',
  borderRadius: 'md',
  density: 'cozy',
};

function loadStoredBranding(): EnterpriseBranding {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultBranding, ...parsed };
    }
  } catch {
    // Ignore corrupt data
  }
  return { ...defaultBranding };
}

export const brandingState = reactive<EnterpriseBranding>(loadStoredBranding());

/**
 * Updates tenant branding and applies custom CSS variables dynamically.
 */
export function updateBranding(updates: Partial<EnterpriseBranding>) {
  Object.assign(brandingState, updates);
  try {
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(brandingState));
  } catch {
    // Ignore storage quota
  }
  applyBrandingStyles();
}

/**
 * Applies custom colors and CSS variables to the document root.
 */
export function applyBrandingStyles() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (brandingState.primaryColor) {
    root.style.setProperty('--color-primary', brandingState.primaryColor);
  }
  if (brandingState.secondaryColor) {
    root.style.setProperty('--color-accent', brandingState.secondaryColor);
  }

  // Update favicon if provided
  if (brandingState.favicon) {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = brandingState.favicon;
  }
}

// Automatically watch and persist
watch(
  brandingState,
  () => {
    applyBrandingStyles();
  },
  { deep: true },
);
