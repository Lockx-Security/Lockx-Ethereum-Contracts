// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxCoreCoverage
 * @notice Targeted tests to increase coverage on Lockx.sol from 65.18% to 80%+
 */
contract LockxCoreCoverage is Test {
    Lockx public lockx;
    MockERC20 public token;
    MockERC721 public nft;
    
    address public user = makeAddr("user");
    address public user2 = makeAddr("user2");
    address public keyAddr = makeAddr("key");
    uint256 private userKey = 0x1234;
    
    // EIP-712 constants
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('3'));
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();
        
        token.initialize("Test Token", "TEST");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr = vm.addr(userKey);
        
        // Fund users
        vm.deal(user, 10 ether);
        vm.deal(user2, 10 ether);
        token.mint(user, 1000e18);
        token.mint(user2, 1000e18);
        nft.mint(user, 1);
        nft.mint(user2, 2);
    }
    
    /**
     * @notice Test ZeroKey error in createLockboxWithETH - line 88
     */
    function test_createLockboxWithETH_zeroKey_error() public {
        vm.prank(user);
        vm.expectRevert(); // ZeroKey
        lockx.createLockboxWithETH{value: 1 ether}(user, address(0), bytes32("zero"));
    }
    
    /**
     * @notice Test ZeroAmount error in createLockboxWithETH - line 89  
     */
    function test_createLockboxWithETH_zeroAmount_error() public {
        vm.prank(user);
        vm.expectRevert(); // ZeroAmount
        lockx.createLockboxWithETH{value: 0}(user, keyAddr, bytes32("zero"));
    }
    
    /**
     * @notice Test SelfMintOnly error in createLockboxWithETH - line 87
     */
    function test_createLockboxWithETH_selfMintOnly_error() public {
        vm.prank(user);
        vm.expectRevert(); // SelfMintOnly
        lockx.createLockboxWithETH{value: 1 ether}(user2, keyAddr, bytes32("other"));
    }
    
    /**
     * @notice Test ZeroTokenAddress error in createLockboxWithERC20 - line 123
     */
    function test_createLockboxWithERC20_zeroTokenAddress_error() public {
        vm.prank(user);
        vm.expectRevert(); // ZeroTokenAddress
        lockx.createLockboxWithERC20(user, keyAddr, address(0), 100e18, bytes32("zero"));
    }
    
    /**
     * @notice Test ArrayLengthMismatch error in createLockboxWithBatch - line 200
     */
    function test_createLockboxWithBatch_arrayLengthMismatch_error() public {
        address[] memory tokenAddresses = new address[](2);
        tokenAddresses[0] = address(token);
        tokenAddresses[1] = address(token);
        
        uint256[] memory amounts = new uint256[](1); // Wrong length!
        amounts[0] = 100e18;
        
        address[] memory nftContracts = new address[](0);
        uint256[] memory nftTokenIds = new uint256[](0);
        
        vm.prank(user);
        vm.expectRevert(); // ArrayLengthMismatch
        lockx.createLockboxWithBatch{value: 1 ether}(
            user, keyAddr, 1 ether, tokenAddresses, amounts,
            nftContracts, nftTokenIds, bytes32("mismatch")
        );
    }
    
    /**
     * @notice Test EthValueMismatch error in createLockboxWithBatch - line 201
     */
    function test_createLockboxWithBatch_ethValueMismatch_error() public {
        uint256 declaredETH = 2 ether;
        uint256 actualETH = 1 ether; // Mismatch!
        
        address[] memory tokenAddresses = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        address[] memory nftContracts = new address[](0);
        uint256[] memory nftTokenIds = new uint256[](0);
        
        vm.prank(user);
        vm.expectRevert(); // EthValueMismatch
        lockx.createLockboxWithBatch{value: actualETH}(
            user, keyAddr, declaredETH, tokenAddresses, amounts,
            nftContracts, nftTokenIds, bytes32("mismatch")
        );
    }
    
    /**
     * @notice Test DefaultURIAlreadySet error in setDefaultMetadataURI - line 225
     */
    function test_setDefaultMetadataURI_alreadySet_error() public {
        // Set URI first time
        lockx.setDefaultMetadataURI("https://example.com/metadata/");
        
        // Try to set again
        vm.expectRevert(); // DefaultURIAlreadySet
        lockx.setDefaultMetadataURI("https://other.com/metadata/");
    }
    
    /**
     * @notice Test NoURI error in tokenURI - line 290
     */
    function test_tokenURI_noURI_error() public {
        // Create lockbox but don't set any URI
        vm.prank(user);
        lockx.createLockboxWithETH{value: 1 ether}(user, keyAddr, bytes32("test"));
        
        // Try to get URI when none is set
        vm.expectRevert(); // NoURI
        lockx.tokenURI(0);
    }
    
    /**
     * @notice Test TransfersDisabled error in transfer functions - line 440
     */
    function test_transfers_disabled_error() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 1 ether}(user, keyAddr, bytes32("test"));
        
        // Try to transfer (should fail)
        vm.prank(user);
        vm.expectRevert(); // TransfersDisabled
        lockx.transferFrom(user, user2, 0);
        
        // Try safeTransferFrom
        vm.prank(user);
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user, user2, 0);
        
        // Try safeTransferFrom with data
        vm.prank(user);
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user, user2, 0, "");
    }
    
    /**
     * @notice Test FallbackNotAllowed error in fallback - line 466
     */
    function test_fallback_notAllowed_error() public {
        // Call a non-existent function to trigger fallback
        vm.prank(user);
        vm.expectRevert(); // FallbackNotAllowed
        (bool success, ) = address(lockx).call(abi.encodeWithSignature("nonExistentFunction()"));
        // Don't assert success - expectRevert handles it
    }
    
    /**
     * @notice Test receive function UseDepositETH error
     */
    function test_receive_useDepositETH_error() public {
        // Send ETH to contract via call (triggers receive)
        vm.prank(user);
        vm.expectRevert(); // UseDepositETH
        (bool success, ) = address(lockx).call{value: 1 ether}("");
        require(!success, "Should have failed");
    }
    
    /**
     * @notice Test SignatureExpired error in setTokenMetadataURI - line 255
     */
    function test_setTokenMetadataURI_signatureExpired_error() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 1 ether}(user, keyAddr, bytes32("test"));
        
        uint256 tokenId = 0;
        uint256 pastTimestamp = block.timestamp - 1; // Expired
        string memory newURI = "https://example.com/1";
        
        bytes memory signature = _createSetTokenURISignature(tokenId, newURI, pastTimestamp);
        bytes memory data = abi.encode(
            tokenId, newURI, bytes32("expired"), user, pastTimestamp
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data); // SET_TOKEN_URI = 5
        
        vm.prank(user);
        vm.expectRevert(); // SignatureExpired
        lockx.setTokenMetadataURI(
            tokenId, messageHash, signature, newURI, bytes32("expired"), pastTimestamp
        );
    }
    
    function _createSetTokenURISignature(uint256 tokenId, string memory uri, uint256 expiry) 
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, uri, bytes32("test"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data) internal returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        
        return keccak256(abi.encodePacked('\\x19\\x01', domainSeparator, structHash));
    }
}