<script lang="ts">
    import { getToasts } from './toast.svelte';
</script>

<div class="toaster">
    {#each getToasts() as toast (toast.id)}
        <div class="toast toast-{toast.type}">{toast.text}</div>
    {/each}
</div>

<style>
    .toaster {
        position: fixed;
        top: 20px;
        right: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 9999;
        pointer-events: none;
    }
    .toast {
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        color: #fff;
        animation: toast-in 0.25s ease;
    }
    .toast-success { background: #2ecc71; }
    .toast-error   { background: #e74c3c; }
    @keyframes toast-in {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0); }
    }
</style>
