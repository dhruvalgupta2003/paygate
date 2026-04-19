// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {LimenReceipts} from "../src/LimenReceipts.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @title Deploy LimenReceipts
/// @notice Usage:
///   forge script contracts/base/script/Deploy.s.sol \
///     --rpc-url $LIMEN_BASE_RPC_URL --broadcast --verify \
///     --sig 'run(address,address,address)' \
///     <usdc_address> <receiver_address> <admin_address>
contract Deploy is Script {
    function run(address usdc, address receiver, address admin) external {
        vm.startBroadcast();
        new LimenReceipts(IERC20(usdc), receiver, admin);
        vm.stopBroadcast();
    }
}
