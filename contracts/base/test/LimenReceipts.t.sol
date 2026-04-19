// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LimenReceipts} from "../src/LimenReceipts.sol";
import {ERC20Mock} from "openzeppelin-contracts/contracts/mocks/token/ERC20Mock.sol";

contract LimenReceiptsTest is Test {
    LimenReceipts internal rec;
    ERC20Mock       internal usdc;

    address internal admin   = address(0xA);
    address internal payer   = address(0xB);
    address internal receiver = address(0xC);

    function setUp() public {
        usdc = new ERC20Mock();
        rec  = new LimenReceipts(usdc, receiver, admin);

        // Pre-fund receipts contract so refunds work.
        usdc.mint(address(rec), 1_000_000e6);
    }

    function test_commit_emitsEvent() public {
        vm.prank(admin);
        rec.commitReceipt(bytes32("n1"), payer, 1_000, "/api/v1/weather/sf");
        (address p, uint96 amt, , bool refunded) = rec.receipts(bytes32("n1"));
        assertEq(p, payer);
        assertEq(amt, 1_000);
        assertEq(refunded, false);
    }

    function test_commit_duplicateReverts() public {
        vm.startPrank(admin);
        rec.commitReceipt(bytes32("n1"), payer, 1_000, "/x");
        vm.expectRevert(abi.encodeWithSelector(LimenReceipts.ReceiptAlreadyCommitted.selector, bytes32("n1")));
        rec.commitReceipt(bytes32("n1"), payer, 1_000, "/x");
        vm.stopPrank();
    }

    function test_refund_pays_payer() public {
        vm.startPrank(admin);
        rec.commitReceipt(bytes32("n1"), payer, 1_000, "/x");
        rec.refundReceipt(bytes32("n1"), "test");
        vm.stopPrank();
        assertEq(usdc.balanceOf(payer), 1_000);
    }

    function test_refund_cannotRepeat() public {
        vm.startPrank(admin);
        rec.commitReceipt(bytes32("n1"), payer, 1_000, "/x");
        rec.refundReceipt(bytes32("n1"), "test");
        vm.expectRevert(abi.encodeWithSelector(LimenReceipts.ReceiptAlreadyRefunded.selector, bytes32("n1")));
        rec.refundReceipt(bytes32("n1"), "again");
        vm.stopPrank();
    }

    function test_only_operator_canCommit() public {
        vm.expectRevert();
        rec.commitReceipt(bytes32("n1"), payer, 1, "/x");
    }

    function test_rescue_cannotDrainPaywallToken() public {
        vm.prank(admin);
        vm.expectRevert(bytes("cannot rescue paywall token"));
        rec.rescueForeignToken(usdc, admin, 1);
    }
}
