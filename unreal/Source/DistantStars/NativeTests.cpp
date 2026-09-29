#include "NativeSceneAssets.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FNativeCoordinateTest, "DistantStars.Native.Coordinates",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FNativeCoordinateTest::RunTest(const FString& Parameters)
{
    TestEqual(TEXT("Forward maps to Unreal X"), DistantStars::ToNative(FVector(0, 0, -1)), FVector(100, 0, 0));
    TestEqual(TEXT("North maps to Unreal Z"), DistantStars::ToNative(FVector(0, 1, 0)), FVector(0, 0, 100));
    const FVector Point(.4, -.7, .8);
    for (const double Units : {100.0, 1000.0, 100000.0})
        TestTrue(TEXT("View coordinates round trip"), DistantStars::FromNative(DistantStars::ToNative(Point, Units), Units).Equals(Point, 1.e-10));
    // glTF CCW must become clockwise for Unreal. Reversing indices again causes backface normal flips.
    const FVector A = DistantStars::ToNative(FVector(1, 0, 0));
    const FVector B = DistantStars::ToNative(FVector(1, 1, 0));
    const FVector C = DistantStars::ToNative(FVector(1, 0, 1));
    const FVector ExpectedNormal = DistantStars::ToNative(FVector(1, 0, 0), 1);
    TestTrue(TEXT("Reflected winding matches clockwise faces"), FVector::DotProduct(FVector::CrossProduct(B-A,C-A), ExpectedNormal)<0);
    return true;
}
#endif
