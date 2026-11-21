// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../VoxelAirMarket.sol";

contract DeclinesPayment {
    function book(VoxelAirMarket market, bytes32 salt, uint64 minute, uint8[] calldata cells) external {
        market.reservePath(salt,minute,cells,5);
    }
    // No payable receive function: the last compensation transfer must revert.
}
