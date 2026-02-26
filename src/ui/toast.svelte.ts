export type ToastType = 'success' | 'error';

interface Toast {
    id: number;
    text: string;
    type: ToastType;
}

let toasts = $state<Toast[]>([]);
let nextId = 0;

export function showMessage(text: string, type: ToastType = 'success') {
    const id = nextId++;
    toasts.push({ id, text, type });
    setTimeout(() => {
        const idx = toasts.findIndex(t => t.id === id);
        if (idx !== -1) toasts.splice(idx, 1);
    }, 3000);
}

export function getToasts(): Toast[] {
    return toasts;
}
