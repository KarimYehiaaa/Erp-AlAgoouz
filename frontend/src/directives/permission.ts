import { useAuthStore } from '@/stores/auth';
import type { Directive } from 'vue';

export const permissionDirective: Directive = {
  mounted(el, binding) {
    const authStore = useAuthStore();
    const requiredPermission = binding.value;

    if (requiredPermission) {
      const hasPerm = Array.isArray(requiredPermission)
        ? requiredPermission.some((p) => authStore.hasPermission(p))
        : authStore.hasPermission(requiredPermission);

      if (!hasPerm && el.parentNode) {
        // Remove the element from the DOM
        el.parentNode.removeChild(el);
      }
    }
  },
  updated(el, binding) {
    const authStore = useAuthStore();
    const requiredPermission = binding.value;

    if (requiredPermission) {
      const hasPerm = Array.isArray(requiredPermission)
        ? requiredPermission.some((p) => authStore.hasPermission(p))
        : authStore.hasPermission(requiredPermission);

      if (!hasPerm && el.parentNode) {
        // Remove the element from the DOM
        el.parentNode.removeChild(el);
      }
    }
  },
};
