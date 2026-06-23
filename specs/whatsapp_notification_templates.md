# WhatsApp Notification Templates

---

## `order_received_seller`

**Locale:** `en`

**Message body:**

```
Hello {{seller_location}} team,

There is a new order for your location. Here are the details.

Customer Name: {{buyer_name}}
Phone Number: {{buyer_phone_number}}
Order Number: {{order_number}}
Total Amount: ₹{{total_amount}} ({{item_count}} items)

Please contact the buyer in the next {{eta}} hours.
```

**Button URL:** `https://app.yukti.so/estimates/{{1}}`

| Variable | Description |
|---|---|
| `{{seller_location}}` | Seller's location/warehouse name |
| `{{buyer_name}}` | Buyer's contact name or business name |
| `{{buyer_phone_number}}` | Buyer's phone number |
| `{{order_number}}` | Order reference number |
| `{{total_amount}}` | Order total in INR |
| `{{item_count}}` | Number of line items |
| `{{eta}}` | Response time commitment in hours |
| `{{1}}` | Order ID (appended to button URL) |

---

## `order_received_buyer`

**Locale:** `en`

**Message body:**

```
Hello {{buyer_name}},

We received your order for {{item_count}} items. Here are your details.

Order Number: {{order_number}}
Total Amount: ₹{{total_amount}}

Our {{seller_name}} team from {{seller_location}} will contact you in {{eta}} hours.
```

**Button URL:** `https://app.yukti.so/buy/estimates/{{1}}`

| Variable | Description |
|---|---|
| `{{buyer_name}}` | Buyer's contact name or business name |
| `{{item_count}}` | Number of line items |
| `{{order_number}}` | Order reference number |
| `{{total_amount}}` | Order total in INR |
| `{{seller_name}}` | Seller's business name |
| `{{seller_location}}` | Seller's location/warehouse name |
| `{{eta}}` | Expected response time in hours |
| `{{1}}` | Order ID (appended to button URL) |

---

## `request_received_seller`

**Locale:** `en`

**Message body:**

```
Hello {{seller_location}} team, ,

There is a new request for your location. Here are the details.

Customer Name: {{buyer_name}}
Phone Number: {{buyer_phone_number}}
Estimate Number: {{request_number}}
Total Amount: ₹{{total_amount}} ({{item_count}} items)

Please contact the buyer in the next {{eta}} hours.
```

**Button URL:** `https://app.yukti.so/orders/{{1}}`

| Variable | Description |
|---|---|
| `{{seller_location}}` | Seller's location/warehouse name |
| `{{buyer_name}}` | Buyer's contact name or business name |
| `{{buyer_phone_number}}` | Buyer's phone number |
| `{{request_number}}` | Estimate/request reference number |
| `{{total_amount}}` | Request total in INR |
| `{{item_count}}` | Number of line items |
| `{{eta}}` | Response time commitment in hours |
| `{{1}}` | Estimate ID (appended to button URL) |

---

## `request_received_buyer`

**Locale:** `en`

**Message body:**

```
Hello {{buyer_name}},

We received your request for {{item_count}} items. Here are your details.

Request Number: {{estimate_number}}
Total Amount: ₹{{total_amount}}

Our {{seller_name}} team from {{seller_location}} will contact you in {{eta}} hours.
```

**Button URL:** `https://app.yukti.so/buy/orders/{{1}}`

| Variable | Description |
|---|---|
| `{{buyer_name}}` | Buyer's contact name or business name |
| `{{item_count}}` | Number of line items |
| `{{estimate_number}}` | Estimate/request reference number |
| `{{total_amount}}` | Request total in INR |
| `{{seller_name}}` | Seller's business name |
| `{{seller_location}}` | Seller's location/warehouse name |
| `{{eta}}` | Expected response time in hours |
| `{{1}}` | Estimate ID (appended to button URL) |

---

## `login_otp`

**Locale:** `en_US`

**Message body:**

```
OTP Code: {{1}}. This is your OTP code for {{2}}. For your security, do not share this code.

If you have any concerns or questions, contact us at {{3}}.
```

| Variable | Description |
|---|---|
| `{{1}}` | OTP code |
| `{{2}}` | Product/app name |
| `{{3}}` | Support contact number |
