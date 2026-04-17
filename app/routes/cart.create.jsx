import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";

export async function action({ request }) {
  try {
    const shopId = request.headers.get("X-Shopify-Shop-Id");
    if (!shopId) {
      return json({ error: "Shop ID is required" }, { status: 400 });
    }

    // Get shop domain from Origin header
    const origin = request.headers.get("Origin");
    if (!origin) {
      return json({ error: "Origin header is required" }, { status: 400 });
    }

    const { hostname } = new URL(origin);
    const { storefront } = await unauthenticated.storefront(hostname);

    // Create a new cart
    const response = await storefront.graphql(`
      mutation cartCreate {
        cartCreate {
          cart {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `);

    const body = await response.json();
    
    if (body.data?.cartCreate?.userErrors?.length > 0) {
      return json({ error: body.data.cartCreate.userErrors[0].message }, { status: 400 });
    }

    const cartId = body.data?.cartCreate?.cart?.id;
    if (!cartId) {
      return json({ error: "Failed to create cart" }, { status: 500 });
    }

    return json({ cart_id: cartId });
  } catch (error) {
    console.error('Error creating cart:', error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
} 