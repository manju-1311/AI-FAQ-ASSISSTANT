const app = require('./app');
const connectDB = async () => {
  try {
    const dbConnect = require('./config/db');
    await dbConnect();
  } catch (error) {
    console.error('Failed to connect to the database', error);
  }
};

const startServer = async () => {
  // Connect to database
  await connectDB();

  const preferredPort = Number(process.env.PORT) || 5000;
  const getPort = (port) => Number.isInteger(port) && port > 0 ? port : 5000;

  const listen = (port) => new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${port}`);
      resolve(server);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(Object.assign(new Error(`Port ${port} is already in use.`), { code: 'EADDRINUSE', port }));
        return;
      }
      reject(error);
    });
  });

  let server;
  let portToUse = getPort(preferredPort);

  try {
    server = await listen(portToUse);
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      const fallbackPort = portToUse + 1;
      console.warn(`Port ${portToUse} is busy. Retrying on ${fallbackPort} instead.`);
      server = await listen(fallbackPort);
      portToUse = fallbackPort;
    } else {
      throw error;
    }
  }

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err, promise) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    // Close server & exit process
    server.close(() => process.exit(1));
  });
};

startServer();
