// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./VoxelAir.sol";

contract VoxelAirMarket is VoxelAir {
    error QuoteChanged();
    error NotForSale(bytes32 id);
    event Settled(bytes32 indexed newId, address indexed buyer, uint256 sellerBookings, uint256 total);

    /// Snapshot one synthetic minute in one RPC read, including immutable quotes.
    function board(uint64 minute) external view returns (bytes32[64] memory ids, address[64] memory owners, uint128[64] memory prices, bool[64] memory departed) {
        for (uint8 i; i < 64; i++) {
            bytes32 id = occupant[minute][i];
            ids[i] = id;
            if (id == bytes32(0)) continue;
            Booking storage b = bookings[id];
            owners[i] = b.owner;
            prices[i] = b.quote;
            departed[i] = b.departed;
        }
    }

    /// Bind the buyer's approval to the exact bookings seen, in first-contact order.
    function buyoutMany(uint64 minute, uint8[] calldata cells, bytes32[] calldata expected,
        bytes32 alternative, bytes32 salt) external payable returns (bytes32 newId) {
        if (cells.length == 0 || cells.length > 16 || expected.length == 0 || expected.length > cells.length) revert Invalid();
        if (alternative != bytes32(0)) {
            Booking storage alt = bookings[alternative];
            if (alt.owner != msg.sender || alt.minute != minute) revert Invalid();
            _release(alternative);
        }
        uint256 count;
        uint256 total;
        for (uint256 i; i < cells.length; i++) {
            bytes32 id = occupant[minute][cells[i]];
            if (id == bytes32(0)) continue;
            if (count >= expected.length || expected[count] != id) revert QuoteChanged();
            Booking storage seller = bookings[id];
            if (seller.owner == msg.sender || seller.quote == 0) revert NotForSale(id);
            total += seller.quote;
            // Clears all cells of this reservation. Multiple hits are charged only once.
            _release(id);
            count++;
        }
        if (count != expected.length) revert QuoteChanged();
        if (msg.value != total) revert WrongPrice();
        newId = _reserve(salt, minute, cells, 0);
        for (uint256 i; i < count; i++) {
            Booking storage seller = bookings[expected[i]];
            (bool ok,) = payable(seller.owner).call{value:seller.quote}("");
            if (!ok) revert PayoutFailed();
            emit Bought(expected[i], newId, seller.owner, seller.quote);
        }
        emit Settled(newId,msg.sender,count,total);
    }
}
