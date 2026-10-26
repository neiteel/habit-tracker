import { Toast } from '@base-ui/react/toast'

// One manager for the app, so code outside React (or far from the root) can raise a toast.
export const toasts = Toast.createToastManager()
