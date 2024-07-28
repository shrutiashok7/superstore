import * as readline from 'readline';
import { MongoClient, ObjectId } from 'mongodb';

const uri = "mongodb://localhost:27017/"; 
const client = new MongoClient(uri);

interface Product {
    _id: ObjectId;
    name: string;
    price: number;
    quantity: number;
    seller_id: string;
}
  
  interface CartItem {
    productId: ObjectId;
    name: string;
    price: number;
    quantity: number;
}

interface User {
  _id: ObjectId;
  username: string;
  role: string;
}

interface Order {
  _id: ObjectId;
  userId: string;
  items: {
      productId: ObjectId;
      name: string;
      price: number;
      quantity: number;
  }[];
  orderDate: Date;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

async function connecttodb() {
  try {
    await client.connect();
    return client.db("superstore"); 
  } catch (error) {
    console.error("Could not connect to MongoDB", error);
    process.exit(1);
  }
}

async function login(username: string, password: string): Promise<{ userId: string, role: string } | null> {
    const db = await connecttodb();
    const users = db.collection('login');
    const newRegisters = db.collection('newRegister');
  
    // checking in users collection
    const user = await users.findOne({ username: username });
    if (user && (password == user.password)) {
      console.log("Successfully logged in!");
      return { userId: user._id.toString(), role: user.role };
    }
  
    // checking in newRegister collection
    const newRegister = await newRegisters.findOne({ username: username });
    if (newRegister && (password === newRegister.password)) {
      console.log("Successfully logged in!");
      return { userId: newRegister._id.toString(), role: newRegister.role };
    }
  
    console.log("Incorrect username or password");
    return null;
}

async function registerUser(name: string, username: string, password: string, phoneNumber: string, role: string): Promise<void> {
    if (!name || !username || !password || !phoneNumber) {
      throw new Error("Please enter valid values");
    }
  
    const db = await connecttodb();
    const users = db.collection('newRegister');
  
    // checking if username already exists
    const existingUser = await users.findOne({ username });
    if (existingUser) {
      throw new Error("Username already exists. Please choose a different username.");
    }
  
    // creating user object
    const newRegister = {
      name,
      username,
      password,
      phoneNumber,
      role,
      createdAt: new Date()
    };
  
    // inserting new user into db
    await users.insertOne(newRegister);
    console.log("User registered successfully!");
}

async function getValidInput(prompt: string, validator: (input: string) => boolean, errorMessage: string): Promise<string> {
    while (true) {
      const input = await askQuestion(prompt);
      if (input.trim() === "") {
        console.log("This is required! Please enter valid information.");
      } else if (validator(input)) {
        return input;
      } else {
        console.log(errorMessage);
      }
    }
}

function isValidPhoneNumber(input: string): boolean {
    return /^\d{10}$/.test(input);
}

function isValidRole(input: string): boolean {
    return input.toLowerCase() === 'buyer' || input.toLowerCase() === 'seller';
}

function isYesNoResponse(input: string): boolean {
  return ['yes', 'no'].includes(input.toLowerCase());
}

async function handleRegistration() {
    try {
      const name = await getValidInput('Enter your name: ', () => true, "");
      const username = await getValidInput('Enter your username: ', () => true, "");
      const password = await getValidInput('Enter your password: ', () => true, "");
      const phoneNumber = await getValidInput(
        'Enter your phone number: ',
        isValidPhoneNumber,
        'Please enter only 10 digits/please enter only numbers'
      );
      const role = await getValidInput(
        'Enter your role (buyer/seller): ',
        isValidRole,
        'Please enter either "buyer" or "seller"'
      );
      
      await registerUser(name, username, password, phoneNumber, role);
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error("An unknown error occurred");
      }
    }
}

async function findProduct(productName: string): Promise<Product | null> {
    const db = await connecttodb();
    const products = db.collection<Product>('products');
    return await products.findOne({ name: productName });
}

async function askForQuantity(question: string): Promise<number> {
    while (true) {
      const input = await askQuestion(question);
      if (/^\d+$/.test(input)) { //only numbers
        const quantity = parseInt(input);
        if (quantity > 0) {
          return quantity;
        }
      }
      console.log("Please enter a valid positive number.");
    }
}

async function addToCart(userId: string, product: Product, quantity: number) {
    const db = await connecttodb();
    const cart = db.collection('cart');
    
    const cartItem: CartItem = {
      productId: product._id,
      name: product.name,
      price: product.price,
      quantity: quantity
    };
  
    await cart.updateOne(
      { userId: userId },
      { $addToSet: { items: cartItem } },
      { upsert: true }
    );
}

async function viewCart(userId: string) {
    const db = await connecttodb();
    const cart = db.collection('cart');
    const userCart = await cart.findOne({ userId: userId });
    
    if (!userCart || !userCart.items || userCart.items.length === 0) {
      console.log("Your cart is empty.");
      return;
    }
  
    console.log("Your cart:");
    let totalCost = 0;
    let totalItems = 0;
    userCart.items.forEach((item: CartItem) => {
      const itemTotal = item.price * item.quantity;
      console.log(`${item.name} - Quantity: ${item.quantity} - Price: $${item.price.toFixed(2)}`);
      totalCost += itemTotal;
      totalItems += item.quantity; // to add up cost w.r.t quantity
    });
    
    console.log(`\nSubtotal (${totalItems} items): $${totalCost.toFixed(2)}`);
}

async function updateCartItem(userId: string, productName: string, newQuantity: number) {
    const db = await connecttodb();
    const cart = db.collection('cart');
    
    // fetching user's cart
    const userCart = await cart.findOne({ userId: userId });
    
    if (!userCart) {
      console.log("Cart not found for this user.");
      return;
    }
  
    if (newQuantity <= 0) {
      // Remove the item from the cart
      userCart.items = userCart.items.filter((item: CartItem) => item.name !== productName);
      console.log(`${productName} removed from cart.`);
    } else {
      // Update the quantity of the item
      const itemIndex = userCart.items.findIndex((item: CartItem) => item.name === productName);
      if (itemIndex !== -1) {
        userCart.items[itemIndex].quantity = newQuantity;
        console.log(`${productName} quantity updated to ${newQuantity}.`);
      } else {
        console.log(`${productName} not found in cart.`);
        return;
      }
    }
  
    // Update the entire cart document
    await cart.replaceOne({ userId: userId }, userCart);
}

async function placeOrder(userId: string) {
  const db = await connecttodb();
  const cart = db.collection('cart');
  const orders = db.collection('orders');
  const products = db.collection<Product>('products');
  
  const userCart = await cart.findOne({ userId: userId });
  if (!userCart || !userCart.items || userCart.items.length === 0) {
    console.log("Your cart is empty. Cannot place order.");
    return;
  }

  console.log("Payment method: Cash on Delivery");

  // Ask for address
  const doorNo = await askQuestion("Enter door no./flat: ");
  const streetArea = await askQuestion("Enter street name, area: ");
  const cityPincode = await askQuestion("Enter city, pincode: ");

  const address = {
    "door no./flat": doorNo,
    "street name, area": streetArea,
    "city, pincode": cityPincode
  };

  const confirmOrder = await getValidInput(
    "Confirm order? (yes/no): ",
    isYesNoResponse,
    'Please enter a valid value (yes or no).'
  );

  if (confirmOrder.toLowerCase() !== 'yes') {
    console.log("Order cancelled.");
    return;
  }


  try {
      // Update product quantities
      for (const item of userCart.items) {
        const product = await products.findOne({ _id: item.productId });
        if (!product) {
          throw new Error(`Product not found: ${item.name}`);
        }
        if (product.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${item.name}`);
        }
        
        await products.updateOne(
          { _id: item.productId },
          { $inc: { quantity: -item.quantity } },
        );
      }

      await orders.insertOne({
        userId: userId,
        items: userCart.items,
        orderDate: new Date(),
        paymentMethod: "Cash on Delivery",
        address: address
      });

      await cart.deleteOne({ userId: userId });

      console.log("Order placed successfully!");
    } catch (error) {
      if (error instanceof Error) {
        console.error("Failed to place order:", error.message);
      } else {
        console.error("An unknown error occurred while placing the order");
      }
    } 
}

async function viewSellerProfile(seller_id: string) {
  console.log("Viewing profile for seller_id:", seller_id);
  const db = await connecttodb();
  const newRegister = db.collection('newRegister');
  const products = db.collection<Product>('products');
  
  // First, get the seller's username
  const seller = await newRegister.findOne({ _id: new ObjectId(seller_id) });
  
  if (!seller) {
    console.log("Seller not found.");
    return;
  }
  
  const sellerUsername = seller.username;
  
  // Now use the username to find products
  const sellerProducts = await products.find({ seller_id: sellerUsername }).toArray();
  
  console.log("Number of products found:", sellerProducts.length);
  
  console.log("Your products:");
  if (sellerProducts.length === 0) {
    console.log("No products found for this seller.");
  } else {
    sellerProducts.forEach(product => {
      console.log(`${product.name} - Price: $${product.price.toFixed(2)} - Stock: ${product.quantity}`);
    });
  }
}

async function viewSales(seller_id: string) {
  const db = await connecttodb();
  const newRegister = db.collection('newRegister');
  const orders = db.collection<Order>('orders');
  const products = db.collection<Product>('products');

  // Get the seller's username
  const seller = await newRegister.findOne({ _id: new ObjectId(seller_id) });
  if (!seller) {
    console.log("Seller not found.");
    return;
  }

  const sellerUsername = seller.username;
  
  const sellerProducts = await products.find({ seller_id: sellerUsername }).toArray();
  console.log(`Found ${sellerProducts.length} products for seller ${sellerUsername}`);
  
  if (sellerProducts.length === 0) {
    console.log("No products found for this seller.");
    return;
  }
  
  const sellerProductIds = sellerProducts.map(product => product._id);
  
  const sales = await orders.aggregate([
    { $unwind: "$items" },
    { $match: { "items.productId": { $in: sellerProductIds } } },
    { $group: {
      _id: "$items.productId",
      productName: { $first: "$items.name" },
      totalQuantity: { $sum: "$items.quantity" },
      totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
    }}
  ]).toArray();
  
  console.log("Your sales:");
  if (sales.length === 0) {
    console.log("No sales found for your products.");
  } else {
    sales.forEach(sale => {
      console.log(`${sale.productName} - Quantity sold: ${sale.totalQuantity} - Revenue: $${sale.totalRevenue.toFixed(2)}`);
    });
  }
}

async function updateStock(seller_id: string) {
  const db = await connecttodb();
  const newRegister = db.collection('newRegister');
  const products = db.collection<Product>('products');

  // Get the seller's username
  const seller = await newRegister.findOne({ _id: new ObjectId(seller_id) });
  if (!seller) {
    console.log("Seller not found.");
    return;
  }

  const sellerUsername = seller.username;
  
  const sellerProducts = await products.find({ seller_id: sellerUsername }).toArray();
  
  if (sellerProducts.length === 0) {
    console.log("You don't have any products to update.");
    return;
  }
  
  console.log("Your products:");
  sellerProducts.forEach((product, index) => {
    console.log(`${index + 1}. ${product.name} - Current stock: ${product.quantity}`);
  });
  
  const productIndex = parseInt(await askQuestion("Enter the number of the product you want to update: ")) - 1;
  
  if (isNaN(productIndex) || productIndex < 0 || productIndex >= sellerProducts.length) {
    console.log("Invalid product number.");
    return;
  }
  
  const selectedProduct = sellerProducts[productIndex];
  
  let action: string;
  while (true) {
    action = await getValidInput(
      "Do you want to increase or decrease the stock? (increase/decrease): ",
      (input) => ['increase', 'decrease'].includes(input.toLowerCase()),
      "Invalid action. Please choose 'increase' or 'decrease'."
    );
    
    if (action === 'increase' || action === 'decrease') {
      break;
    }
  }
  
  const quantityChange = await askForQuantity(`Enter the quantity to ${action}: `);
  
  const updateQuantity = action === 'increase' ? quantityChange : -quantityChange;
  
  if (selectedProduct.quantity + updateQuantity < 0) {
    console.log("Error: Stock cannot be negative.");
    return;
  }
  
  await products.updateOne(
    { _id: selectedProduct._id },
    { $inc: { quantity: updateQuantity } }
  );
  
  console.log(`Stock updated. New stock for ${selectedProduct.name}: ${selectedProduct.quantity + updateQuantity}`);
}

async function addProduct(seller_id: string) {
  const db = await connecttodb();
  const newRegister = db.collection('newRegister');
  const products = db.collection<Product>('products');
  
  // Get the seller's username
  const seller = await newRegister.findOne({ _id: new ObjectId(seller_id) });
  if (!seller) {
    console.log("Seller not found.");
    return;
  }
  
  const name = await askQuestion("Enter product name: ");
  const price = parseFloat(await askQuestion("Enter product price: "));
  const quantity = await askForQuantity("Enter initial stock quantity: ");
  
  const newProduct: Omit<Product, '_id'> = {
    name,
    price,
    quantity,
    seller_id: seller.username // Use the username here
  };
  
  await products.insertOne(newProduct as Product);
  console.log("Product added successfully!");
}

async function main() {
  try {
      console.log('Welcome! Login if you have an ID. First time at our website? Sign up for free!');
      const choice = await askQuestion('Enter "login" to log in or "register" to sign up: ');

      let userInfo: { userId: string, role: string } | null = null;

      if (choice.toLowerCase() === 'login') {
          const username = await askQuestion('Enter your username: ');
          const password = await askQuestion('Enter your password: ');
          userInfo = await login(username, password);
          if (!userInfo) {
              console.log('Login failed. Exiting.');
              return;
          }
      } else if (choice.toLowerCase() === 'register') {
          await handleRegistration();
          console.log('Please login with your new account.');
          return;
      } else {
          console.log('Invalid choice. Please run the program again and enter either "login" or "register".');
          return;
      }

      if (userInfo.role.toLowerCase() === 'buyer') {
          while (true) {
              console.log('\nBuyer Menu:');
              console.log('1. Search for a product');
              console.log('2. View cart');
              console.log('3. Exit');

              const buyerChoice = await askQuestion('Enter your choice (1-3): ');

              switch (buyerChoice) {
                case '1':
                  let product: Product | null = null;
                  while (true) {
                      const productName = await askQuestion('Enter product name to search: ');
                      product = await findProduct(productName);
                      if (product) {
                          break;
                      }
                      console.log('Product not found. Please try again.');
                  }
                  
                  console.log(`Found: ${product.name} - Price: $${product.price.toFixed(2)} - Available: ${product.quantity}`);
                  const action = await getValidInput(
                      'Choose an action (buy/add to cart): ',
                      (input) => ['buy', 'add to cart'].includes(input.toLowerCase()),
                      'Please enter a valid action (buy or add to cart).'
                  );
                  if (action.toLowerCase() === 'buy' || action.toLowerCase() === 'add to cart') {
                      const quantity = await askForQuantity('Enter quantity: ');
                      await addToCart(userInfo.userId, product, quantity);
                      console.log('Product added to cart.');
                      if (action.toLowerCase() === 'buy') {
                          await viewCart(userInfo.userId);
                          if (await getValidInput('Place order? (yes/no): ', isYesNoResponse, 'Please enter yes or no.') === 'yes') {
                              await placeOrder(userInfo.userId);
                          }
                      }
                  }
                  break;
                  case '2':
                    const db = await connecttodb();
                    const cart = db.collection('cart');
                    const userCart = await cart.findOne({ userId: userInfo.userId });
                    
                    if (!userCart || !userCart.items || userCart.items.length === 0) {
                        console.log("Your cart is empty. Choose option 1. in the buyer menu to add products!");
                        break;  // This will return to the buyer menu
                    }
                    
                    await viewCart(userInfo.userId);
                    
                    const updateCartChoice = await getValidInput(
                        'Do you want to update your cart? (yes/no): ',
                        isYesNoResponse,
                        'Please enter a valid value (yes/no).'
                    );
                    if (updateCartChoice.toLowerCase() === 'yes') {
                        const itemToUpdate = await askQuestion('Enter product name to update: ');
                        const newQuantity = await askForQuantity('Enter new quantity (0 to remove): ');
                        await updateCartItem(userInfo.userId, itemToUpdate, newQuantity);
                        await viewCart(userInfo.userId);
                    }
                    const placeOrderChoice = await getValidInput(
                        'Place order? (yes/no): ',
                        isYesNoResponse,
                        'Please enter a valid value (yes/no).'
                    );
                    if (placeOrderChoice.toLowerCase() === 'yes') {
                        await placeOrder(userInfo.userId);
                    }
                    break;
                  case '3':
                      console.log('Thank you for shopping with us!');
                      return;
                  default:
                      console.log('Invalid choice. Please try again.');
              }
          }
        } else if (userInfo.role.toLowerCase() === 'seller') {
          while (true) {
              console.log("Seller ID:", userInfo.userId);
              console.log('\nSeller Menu:');
              console.log('1. View profile');
              console.log('2. View sales');
              console.log('3. Update stock');
              console.log('4. Add product');
              console.log('5. Exit');
      
              const sellerChoice = await getValidInput(
                  'Enter your choice (1-5): ',
                  (input) => ['1', '2', '3', '4', '5'].includes(input),
                  'Invalid choice. Please enter a number between 1 and 5.'
              );
      
              switch (sellerChoice) {
                  case '1':
                      await viewSellerProfile(userInfo.userId);
                      break;
                  case '2':
                      await viewSales(userInfo.userId);
                      break;
                  case '3':
                      await updateStock(userInfo.userId);
                      break;
                  case '4':
                      await addProduct(userInfo.userId);
                      break;
                  case '5':
                      console.log('Thank you for using our seller platform!');
                      return;
                  default:
                      console.log('Invalid choice. Please try again.');
              }
          }
      } else {
          console.log('Invalid role. Exiting.');
      }
  } finally {
      rl.close();
      await client.close();
  }
}

main ();