import { useAuthStore } from '@/stores/auth';

export const permissionDirective = {
  mounted(el, binding) {
    const authStore = useAuthStore();
    const requiredPermission = binding.value;
    
    if (requiredPermission) {
      const hasPerm = Array.isArray(requiredPermission)
        ? requiredPermission.some(p => authStore.hasPermission(p))
        : authStore.hasPermission(requiredPermission);

      if (!hasPerm) {
        // Remove the element from the DOM
        el.parentNode && el.parentNode.removeChild(el);
      }
    }
  },
  updated(el, binding) {
    const authStore = useAuthStore();
    const requiredPermission = binding.value;
    
    if (requiredPermission) {
      const hasPerm = Array.isArray(requiredPermission)
        ? requiredPermission.some(p => authStore.hasPermission(p))
        : authStore.hasPermission(requiredPermission);

      if (!hasPerm) {
        // Remove the element from the DOM
        el.parentNode && el.parentNode.removeChild(el);
      }
    }
  }
};
