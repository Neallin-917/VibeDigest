import { env } from "@/env";
import { sanitizeErrorMessage } from "@/lib/safe-error";

export const API_BASE_URL =
    env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.hostname}:16081`
        : "http://localhost:16081")

export class ApiClient {
    private static async request(endpoint: string, options: RequestInit = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        const headers = {
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(sanitizeErrorMessage(errorData.detail || errorData.error || `API Error: ${response.statusText}`));
        }

        return response.json();
    }

    static async processVideo(formData: FormData, token: string) {
        return this.request("/api/process-video", {
            method: "POST",
            body: formData,
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
    }

    static async retryOutput(outputId: string, token: string) {
        const formData = new FormData();
        formData.append("output_id", outputId);

        return this.request("/api/retry-output", {
            method: "POST",
            body: formData,
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
    }



    static async updateTaskTitle(taskId: string, title: string, token: string) {
        return this.request(`/api/tasks/${taskId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ video_title: title })
        });
    }

    static async submitFeedback(data: { category: string; message: string; contact_email?: string }, token?: string) {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        }
        if (token) {
            headers.Authorization = `Bearer ${token}`
        }

        return this.request("/api/feedback", {
            method: "POST",
            headers,
            body: JSON.stringify(data)
        });
    }

    static async createCheckoutSession(priceId: string, token: string) {
        const formData = new FormData();
        formData.append("price_id", priceId);

        return this.request("/api/create-checkout-session", {
            method: "POST",
            body: formData,
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
    }

    static async createCustomerPortal(token: string) {
        return this.request("/api/customer-portal", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
    }

    static async createCryptoCharge(priceId: string, token: string) {
        const formData = new FormData();
        formData.append("price_id", priceId);

        return this.request("/api/create-crypto-charge", {
            method: "POST",
            body: formData,
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
    }
}
