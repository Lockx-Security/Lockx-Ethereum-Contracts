| file | path | spdx | pragma | contracts | inherits | imports (external) | imports (local) | lines |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| Lockx.sol | `contracts/Lockx.sol` | BUSL-1.1 | ^0.8.30 | `IERC5192`, `Lockx` | `ERC721`, `Ownable`, `Withdrawals`, `IERC5192` | `@openzeppelin/contracts/token/ERC721/ERC721.sol`, `@openzeppelin/contracts/utils/ReentrancyGuard.sol`, `@openzeppelin/contracts/access/Ownable.sol`, `@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol`, `@openzeppelin/contracts/utils/Strings.sol` | `./Withdrawals.sol`, `./SignatureVerification.sol` | 452 |
| Deposits.sol | `contracts/Deposits.sol` | BUSL-1.1 | ^0.8.30 | `Deposits` (abstract) | `SignatureVerification`, `IERC721Receiver`, `ReentrancyGuard` | `@openzeppelin/contracts/token/ERC721/IERC721.sol`, `@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol`, `@openzeppelin/contracts/utils/ReentrancyGuard.sol`, `@openzeppelin/contracts/token/ERC20/IERC20.sol`, `@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol` | `./SignatureVerification.sol` | 290 |
| Withdrawals.sol | `contracts/Withdrawals.sol` | BUSL-1.1 | ^0.8.30 | `Withdrawals` (abstract) | `Deposits` | `@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol`, `@openzeppelin/contracts/token/ERC20/IERC20.sol`, `@openzeppelin/contracts/utils/ReentrancyGuard.sol`, `@openzeppelin/contracts/token/ERC721/IERC721.sol` | `./Deposits.sol` | 580 |
| SignatureVerification.sol | `contracts/SignatureVerification.sol` | BUSL-1.1 | ^0.8.30 | `SignatureVerification` | `EIP712` | `@openzeppelin/contracts/token/ERC721/ERC721.sol`, `@openzeppelin/contracts/utils/cryptography/ECDSA.sol`, `@openzeppelin/contracts/utils/cryptography/EIP712.sol` | — | 530 |

Notes
- **Lockx.sol**: Core ERC‑721 soulbound lockbox, integrates deposits/withdrawals and EIP‑712 auth.
- **Deposits.sol**: Internal ETH/ERC20/ERC721 deposit bookkeeping and receiver hooks.
- **Withdrawals.sol**: Signature-gated withdrawals, batch ops, and swaps with slippage/overspend protection.
- **SignatureVerification.sol**: EIP‑712 domain, typed data hashing, nonce management, and signature checks.


