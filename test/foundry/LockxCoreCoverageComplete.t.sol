// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxCoreCoverageComplete
 * @notice Complete coverage tests to push Lockx.sol from 13.39% to 90%+ coverage
 * Target: Hit all 112 lines in Lockx.sol
 */
contract LockxCoreCoverageComplete is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC721 public nft;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public keyAddr1 = makeAddr("key1");
    address public keyAddr2 = makeAddr("key2");
    uint256 private key1 = 0x1111;
    uint256 private key2 = 0x2222;
    
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
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        nft = new MockERC721();
        
        tokenA.initialize("Token A", "TOKA");
        tokenB.initialize("Token B", "TOKB");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        keyAddr2 = vm.addr(key2);
        
        // Fund users
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        tokenA.mint(user1, 10000e18);
        tokenB.mint(user1, 10000e18);
        tokenA.mint(user2, 10000e18);
        tokenB.mint(user2, 10000e18);
        
        // Mint NFTs
        for (uint256 i = 0; i < 10; i++) {
            nft.mint(user1, i);
            nft.mint(user2, i + 10);
        }
    }
    
    /**
     * @notice Test constructor (line 66)
     */
    function test_constructor() public {
        // Constructor already called in setUp via new Lockx()
        assertTrue(address(lockx) != address(0), "Contract should be deployed");
        // Test ERC721 name/symbol set in constructor
        assertEq(lockx.name(), "Lockx.io", "Correct name");
        assertEq(lockx.symbol(), "Lockbox", "Correct symbol");
    }
    
    /**
     * @notice Test createLockboxWithETH success (lines 82-99)
     */
    function test_createLockboxWithETH_success() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 2 ether}(user1, keyAddr1, bytes32("eth_lockbox"));
        
        // Check owner
        assertEq(lockx.ownerOf(0), user1, "Should own the lockbox");
        
        // Check locked status (ERC-5192)
        assertTrue(lockx.locked(0), "Should be locked");
    }
    
    /**
     * @notice Test createLockboxWithERC20 success (lines 114-134)
     */
    function test_createLockboxWithERC20_success() public {
        uint256 amount = 1000e18;
        
        vm.startPrank(user1);
        tokenA.approve(address(lockx), amount);
        lockx.createLockboxWithERC20(user1, keyAddr1, address(tokenA), amount, bytes32("erc20_lockbox"));
        vm.stopPrank();
        
        assertEq(lockx.ownerOf(0), user1, "Should own the lockbox");
        assertTrue(lockx.locked(0), "Should be locked");
    }
    
    /**
     * @notice Test createLockboxWithERC721 success (lines 147-166)
     */
    function test_createLockboxWithERC721_success() public {
        vm.startPrank(user1);
        nft.approve(address(lockx), 0);
        lockx.createLockboxWithERC721(user1, keyAddr1, address(nft), 0, bytes32("nft_lockbox"));
        vm.stopPrank();
        
        assertEq(lockx.ownerOf(0), user1, "Should own the lockbox");
        assertTrue(lockx.locked(0), "Should be locked");
    }
    
    /**
     * @notice Test createLockboxWithBatch success (lines 185-211)
     */
    function test_createLockboxWithBatch_success() public {
        uint256 ethAmount = 3 ether;
        
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 500e18;
        amounts[1] = 300e18;
        
        address[] memory nftContracts = new address[](1);
        nftContracts[0] = address(nft);
        
        uint256[] memory nftTokenIds = new uint256[](1);
        nftTokenIds[0] = 1;
        
        vm.startPrank(user1);
        tokenA.approve(address(lockx), amounts[0]);
        tokenB.approve(address(lockx), amounts[1]);
        nft.approve(address(lockx), nftTokenIds[0]);
        
        lockx.createLockboxWithBatch{value: ethAmount}(
            user1, keyAddr1, ethAmount, tokens, amounts, nftContracts, nftTokenIds, bytes32("batch_lockbox")
        );
        vm.stopPrank();
        
        assertEq(lockx.ownerOf(0), user1, "Should own the lockbox");
        assertTrue(lockx.locked(0), "Should be locked");
    }
    
    /**
     * @notice Test setDefaultMetadataURI success (lines 224-227)
     */
    function test_setDefaultMetadataURI_success() public {
        string memory defaultURI = "https://api.lockx.io/metadata/";
        
        lockx.setDefaultMetadataURI(defaultURI);
        
        // Test that it was set by checking tokenURI behavior
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("test"));
        
        string memory uri = lockx.tokenURI(0);
        assertEq(uri, "https://api.lockx.io/metadata/0", "Should append tokenId to default URI");
    }
    
    /**
     * @notice Test setTokenMetadataURI with valid signature (lines 245-275)
     */
    function test_setTokenMetadataURI_success() public {
        // First create a lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("setup"));
        
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        string memory newURI = "https://custom.uri/1";
        
        // Create valid signature
        bytes memory data = abi.encode(
            tokenId, newURI, bytes32("custom"), user1, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data, 1); // SET_TOKEN_URI = 5
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.setTokenMetadataURI(tokenId, messageHash, signature, newURI, bytes32("custom"), expiry);
        
        string memory uri = lockx.tokenURI(tokenId);
        assertEq(uri, newURI, "Should return custom URI");
    }
    
    /**
     * @notice Test tokenURI with custom URI (lines 283-291)
     */
    function test_tokenURI_customURI() public {
        // Set default URI first
        lockx.setDefaultMetadataURI("https://default.com/");
        
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("setup"));
        
        // Should return default + tokenId
        string memory defaultUri = lockx.tokenURI(0);
        assertEq(defaultUri, "https://default.com/0", "Should use default URI");
        
        // Now set custom URI (this test covers the custom URI return path)
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        string memory customURI = "https://custom.lockx.io/special/0";
        
        bytes memory data = abi.encode(tokenId, customURI, bytes32("test"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.setTokenMetadataURI(tokenId, messageHash, signature, customURI, bytes32("test"), expiry);
        
        // Should now return custom URI
        string memory uri = lockx.tokenURI(tokenId);
        assertEq(uri, customURI, "Should return custom URI");
    }
    
    /**
     * @notice Test rotateLockboxKey success (lines 309-336)
     */
    function test_rotateLockboxKey_success() public {
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("setup"));
        
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        address newKey = keyAddr2;
        
        // Create valid signature
        bytes memory data = abi.encode(tokenId, newKey, bytes32("rotate"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 0, data, 1); // ROTATE_KEY = 0
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.rotateLockboxKey(tokenId, messageHash, signature, newKey, bytes32("rotate"), expiry);
        
        // Verify key was rotated by checking the active key
        vm.prank(user1);
        address activeKey = lockx.getActiveLockboxPublicKeyForToken(tokenId);
        assertEq(activeKey, newKey, "Key should be rotated");
    }
    
    /**
     * @notice Test burnLockbox success (lines 357-379)
     */
    function test_burnLockbox_success() public {
        // Create lockbox with assets
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 1000e18);
        nft.approve(address(lockx), 2);
        
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("setup"));
        lockx.depositERC20(0, address(tokenA), 1000e18, bytes32("token"));
        lockx.depositERC721(0, address(nft), 2, bytes32("nft"));
        vm.stopPrank();
        
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Get current nonce for accurate signature
        vm.prank(user1);
        uint256 currentNonce = lockx.getNonce(tokenId);
        
        // Create burn signature
        bytes memory data = abi.encode(tokenId, bytes32("burn"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 4, data, currentNonce); // BURN_LOCKBOX = 4
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.burnLockbox(tokenId, messageHash, signature, bytes32("burn"), expiry);
        
        // Verify token is burned
        vm.expectRevert();
        lockx.ownerOf(tokenId);
    }
    
    /**
     * @notice Test _finalizeBurn internal logic (lines 386-420)
     */
    function test_finalizeBurn_internal() public {
        // The _finalizeBurn function is covered by test_burnLockbox_success
        // This test ensures we hit the internal cleanup logic
        
        // Create lockbox with multiple assets to test all cleanup paths
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 500e18);
        tokenB.approve(address(lockx), 300e18);
        nft.approve(address(lockx), 3);
        nft.approve(address(lockx), 4);
        
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 500e18;
        amounts[1] = 300e18;
        
        address[] memory nftContracts = new address[](2);
        nftContracts[0] = address(nft);
        nftContracts[1] = address(nft);
        
        uint256[] memory nftTokenIds = new uint256[](2);
        nftTokenIds[0] = 3;
        nftTokenIds[1] = 4;
        
        lockx.createLockboxWithBatch{value: 2 ether}(
            user1, keyAddr1, 2 ether, tokens, amounts, nftContracts, nftTokenIds, bytes32("complex")
        );
        vm.stopPrank();
        
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory data = abi.encode(tokenId, bytes32("complex_burn"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 4, data, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.burnLockbox(tokenId, messageHash, signature, bytes32("complex_burn"), expiry);
        
        // Verify burn completed
        vm.expectRevert();
        lockx.ownerOf(tokenId);
    }
    
    /**
     * @notice Test supportsInterface (lines 451-458)
     */
    function test_supportsInterface() public {
        // Test ERC-5192 soulbound interface
        assertTrue(lockx.supportsInterface(type(IERC5192).interfaceId), "Should support ERC-5192");
        
        // Test ERC-721 Receiver interface
        assertTrue(lockx.supportsInterface(type(IERC721Receiver).interfaceId), "Should support ERC-721 Receiver");
        
        // Test ERC-721 interface
        assertTrue(lockx.supportsInterface(0x80ac58cd), "Should support ERC-721");
        
        // Test ERC-165 interface
        assertTrue(lockx.supportsInterface(0x01ffc9a7), "Should support ERC-165");
    }
    
    /**
     * @notice Test receive function (line 463)
     */
    function test_receive_function() public {
        // Send ETH directly to contract (should not revert)
        vm.prank(user1);
        (bool success, ) = address(lockx).call{value: 1 ether}("");
        assertTrue(success, "ETH should be received");
    }
    
    /**
     * @notice Test _update override with transfer blocking (lines 437-449)
     */
    function test_update_transfer_blocking() public {
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("setup"));
        
        // Try to transfer (should fail due to soulbound nature)
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.transferFrom(user1, user2, 0);
        
        // Try approve + transferFrom
        vm.prank(user1);
        lockx.approve(user2, 0);
        
        vm.prank(user2);
        vm.expectRevert(); // TransfersDisabled
        lockx.transferFrom(user1, user2, 0);
        
        // Try safeTransferFrom
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user1, user2, 0);
        
        // Try safeTransferFrom with data
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user1, user2, 0, "");
    }
    
    /**
     * @notice Test various error conditions to hit error paths
     */
    function test_error_conditions() public {
        // Test SelfMintOnly error (line 87)
        vm.prank(user1);
        vm.expectRevert(); // SelfMintOnly
        lockx.createLockboxWithETH{value: 1 ether}(user2, keyAddr1, bytes32("other"));
        
        // Test ZeroKey error (line 88)
        vm.prank(user1);
        vm.expectRevert(); // ZeroKey
        lockx.createLockboxWithETH{value: 1 ether}(user1, address(0), bytes32("zero"));
        
        // Test ZeroAmount error (line 89)
        vm.prank(user1);
        vm.expectRevert(); // ZeroAmount
        lockx.createLockboxWithETH{value: 0}(user1, keyAddr1, bytes32("zero"));
        
        // Test ZeroTokenAddress error for ERC20 (line 123)
        vm.prank(user1);
        vm.expectRevert(); // ZeroTokenAddress
        lockx.createLockboxWithERC20(user1, keyAddr1, address(0), 100e18, bytes32("zero"));
        
        // Test ZeroTokenAddress error for ERC721 (line 156)
        vm.prank(user1);
        vm.expectRevert(); // ZeroTokenAddress
        lockx.createLockboxWithERC721(user1, keyAddr1, address(0), 1, bytes32("zero"));
        
        // Test ArrayLengthMismatch error (line 200)
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        
        uint256[] memory amounts = new uint256[](1); // Wrong length!
        amounts[0] = 100e18;
        
        address[] memory emptyNfts = new address[](0);
        uint256[] memory emptyNftIds = new uint256[](0);
        
        vm.prank(user1);
        vm.expectRevert(); // ArrayLengthMismatch
        lockx.createLockboxWithBatch{value: 1 ether}(
            user1, keyAddr1, 1 ether, tokens, amounts, emptyNfts, emptyNftIds, bytes32("mismatch")
        );
        
        // Test EthValueMismatch error (line 201)
        address[] memory emptyTokens = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        
        vm.prank(user1);
        vm.expectRevert(); // EthValueMismatch
        lockx.createLockboxWithBatch{value: 1 ether}( // send 1 but declare 2
            user1, keyAddr1, 2 ether, emptyTokens, emptyAmounts, emptyNfts, emptyNftIds, bytes32("mismatch")
        );
        
        // Test DefaultURIAlreadySet error (line 225)
        lockx.setDefaultMetadataURI("https://first.com/");
        vm.expectRevert(); // DefaultURIAlreadySet
        lockx.setDefaultMetadataURI("https://second.com/");
        
        // Test NoURI error (line 290) - need fresh contract without default URI
        Lockx freshLockx = new Lockx();
        vm.prank(user1);
        freshLockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("test"));
        vm.expectRevert(); // NoURI
        freshLockx.tokenURI(0);
        
        // Test NonexistentToken error for locked() (line 432)
        vm.expectRevert(); // NonexistentToken
        lockx.locked(999);
        
        // Test FallbackNotAllowed error (line 466)
        vm.expectRevert(); // FallbackNotAllowed
        (bool success, ) = address(lockx).call(abi.encodeWithSignature("nonExistentFunction()"));
        // Don't assert success - expectRevert handles it
    }
    
    /**
     * @notice Test SignatureExpired errors
     */
    function test_signatureExpired_errors() public {
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("setup"));
        
        uint256 tokenId = 0;
        uint256 pastExpiry = block.timestamp - 1; // Expired
        
        // Test SignatureExpired for setTokenMetadataURI (line 255)
        string memory newURI = "https://expired.com/1";
        bytes memory data = abi.encode(tokenId, newURI, bytes32("expired"), user1, pastExpiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SignatureExpired
        lockx.setTokenMetadataURI(tokenId, messageHash, signature, newURI, bytes32("expired"), pastExpiry);
        
        // Test SignatureExpired for rotateLockboxKey (line 318)
        data = abi.encode(tokenId, keyAddr2, bytes32("rotate"), user1, pastExpiry);
        messageHash = _computeMessageHash(tokenId, 0, data, 1);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SignatureExpired
        lockx.rotateLockboxKey(tokenId, messageHash, signature, keyAddr2, bytes32("rotate"), pastExpiry);
        
        // Test SignatureExpired for burnLockbox (line 365)
        data = abi.encode(tokenId, bytes32("burn"), user1, pastExpiry);
        messageHash = _computeMessageHash(tokenId, 4, data, 1);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SignatureExpired
        lockx.burnLockbox(tokenId, messageHash, signature, bytes32("burn"), pastExpiry);
    }
    
    // Helper function to compute EIP-712 message hash
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 expectedNonce) 
        internal view returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, expectedNonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}