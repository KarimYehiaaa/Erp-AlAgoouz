import { useAuthStore } from '@/stores/auth';
import type { Directive } from 'vue';
import { shallowRef, watchEffect } from 'vue';

type PermissionRequirement = string | string[] | undefined;
type PermissionElementState = {
  initiallyHidden: boolean;
  requirement: ReturnType<typeof shallowRef<PermissionRequirement>>;
  stop: () => void;
};

const elementStates = new WeakMap<HTMLElement, PermissionElementState>();

const hasRequiredPermission = (required: PermissionRequirement): boolean => {
  if (!required) return true;

  const authStore = useAuthStore();
  return Array.isArray(required)
    ? required.some((permission) => authStore.hasPermission(permission))
    : authStore.hasPermission(required);
};

export const permissionDirective: Directive = {
  mounted(el, binding) {
    const requirement = shallowRef<PermissionRequirement>(binding.value);
    const state: PermissionElementState = {
      initiallyHidden: el.hidden,
      requirement,
      stop: () => undefined,
    };

    state.stop = watchEffect(() => {
      // Keep the element mounted so Vue can restore it when profile permissions load
      // or the authenticated user changes, while preserving an intentional `hidden`.
      el.hidden = state.initiallyHidden || !hasRequiredPermission(requirement.value);
    });

    elementStates.set(el, state);
  },
  updated(el, binding) {
    const state = elementStates.get(el);
    if (state) state.requirement.value = binding.value;
  },
  beforeUnmount(el) {
    const state = elementStates.get(el);
    if (!state) return;
    state.stop();
    elementStates.delete(el);
  },
};
