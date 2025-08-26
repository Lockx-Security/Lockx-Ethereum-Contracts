import { ethers } from 'hardhat';

export const types = {
  Operation: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'opType', type: 'uint8' },
    { name: 'dataHash', type: 'bytes32' },
  ],
};

export async function domain(verifyingContract: string) {
  const { chainId } = await ethers.provider.getNetwork();
  return {
    name: 'Lockx',
    version: '4',
    chainId,
    verifyingContract,
  } as const;
}

export async function eip712Hash(verifyingContract: string, opStruct: any) {
  const dom = await domain(verifyingContract);
  return ethers.TypedDataEncoder.hash(dom, types, opStruct);
}
