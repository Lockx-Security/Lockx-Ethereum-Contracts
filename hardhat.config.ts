import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-gas-reporter';
import '@typechain/hardhat';
import 'solidity-coverage';
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.30',
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || '',
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || '',
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
  // Coverage config; mocks are fine to include/exclude later as needed
  solcover: {
    sources: './contracts',
    skipFiles: ['contracts/mocks/'],
    exclude: ['contracts/mocks/**/*'],
  },
};

export default config;

