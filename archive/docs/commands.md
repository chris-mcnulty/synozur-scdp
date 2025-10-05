// custom start for dev server
NODE_ENV=development npx tsx server/index.ts

//custom build for production server
./build.sh

//kill dev server on port 5000
npx kill-port 5000