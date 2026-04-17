import { unauthenticated } from "../shopify.server";

export { createOpenAIDirectService } from "./openai-direct.server.js";

export async function getCartIdFromStorefront(shopDomain) {
  console.log("getCartIdFromStorefront called with domain:", shopDomain);
  try {
    const { hostname } = new URL(shopDomain);
    
    const { storefront } = await unauthenticated.storefront(hostname);
    console.log("Storefront client created successfully");
    
    const response = await storefront.graphql(
      `#graphql
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
      }`
    );
    
    const body = await response.json();
    console.log("GraphQL response body:", JSON.stringify(body, null, 2));
    
    if (body.data?.cartCreate?.cart?.id) {
      console.log("Created cart ID:", body.data.cartCreate.cart.id);
      return body.data.cartCreate.cart.id;
    }
    
    console.error("Failed to create cart:", body.data?.cartCreate?.userErrors);
    return null;
  } catch (error) {
    console.error("Error creating cart:", error);
    return null;
  }
}

export async function getCustomerMcpEndpoint(shopDomain, conversationId) {
  const { getCustomerAccountUrl, storeCustomerAccountUrl } = await import("../db.server");
  
  try {
    const existingUrl = await getCustomerAccountUrl(conversationId);
    if (existingUrl) return `${existingUrl}/customer/api/mcp`;
    const { hostname } = new URL(shopDomain);
    const { storefront } = await unauthenticated.storefront(hostname);
    const response = await storefront.graphql(`#graphql\nquery shop { shop { customerAccountUrl } }`);
    const body = await response.json();
    const customerAccountUrl = body.data.shop.customerAccountUrl;
    await storeCustomerAccountUrl(conversationId, customerAccountUrl);
    return `${customerAccountUrl}/customer/api/mcp`;
  } catch (error) {
    // console.error("Error getting customer MCP endpoint:", error);
    return null;
  }
}

export async function getShopContext(shopDomain) {
  console.log("getShopContext called with:", shopDomain);
  try {
    const { hostname } = new URL(shopDomain);
    console.log("Extracted hostname:", hostname);
    const { storefront } = await unauthenticated.storefront(hostname);
    const response = await storefront.graphql(
      `#graphql
      query ShopContext {
        shop {
          name
          description
        }
        localization {
          country {
            isoCode
            currency {
              isoCode
            }
          }
          language {
            isoCode
          }
        }
      }`
    );
    const body = await response.json();
    console.log("Shop context response:", JSON.stringify(body, null, 2));
    
    if (body.data) {
      const { shop, localization } = body.data;
      const context = {
        name: shop?.name || "Store",
        description: shop?.description || "This store offers a variety of products",
        country: localization?.country?.isoCode || "IN",
        language: localization?.language?.isoCode || "EN",
        currency: localization?.country?.currency?.isoCode || "INR",
      };
      console.log("Shop context determined:", context);
      return context;
    } else {
      console.log("No shop data found, using defaults");
      return {
        name: "Store",
        description: "This store offers a variety of products",
        country: "IN",
        language: "EN", 
        currency: "INR",
      };
    }
  } catch (error) {
    // console.error("Error getting shop context, using defaults:", error);
    return {
      name: "Store",
      description: "This store offers a variety of products",
      country: "IN",
      language: "EN",
      currency: "INR",
    };
  }
}