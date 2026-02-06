const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export interface Category {
    id: number;
    user_id: number;
    name: string;
    type: "expense" | "income";
}

export async function fetchCategories(token: string): Promise<Category[]> {
    const res = await fetch(`${API_URL}/category/list`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success) {
        throw new Error(data.error || "Failed to fetch categories");
    }
    return data.categories || [];
}

export async function addCategory(
    token: string,
    name: string,
    type: "expense" | "income"
) {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);

    const res = await fetch(`${API_URL}/category/add`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });
    const data = await res.json();
    if (!data.success) {
        throw new Error(data.error || "Failed to add category");
    }
    return data;
}
